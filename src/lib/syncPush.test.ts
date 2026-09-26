jest.mock('@/services/apiClient', () => ({ apiClient: { post: jest.fn() } }))
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, value: string) =>
    require('crypto').createHash('sha256').update(value).digest('hex'),
}))

import { apiClient } from '@/services/apiClient'

import { categoryIdFor } from './categoryId'
import { getDb } from './db'
import { enqueue } from './outbox'
import { pushSpace } from './syncPush'

const SPACE = 'aaaaaaaa-0000-4000-8000-000000000001'
const post = apiClient.post as jest.Mock

// AioKin SyncPushBatchResponse (Models/ViewModel/Vault/SyncPushBatchResponse.cs).
function batch(results: Record<string, unknown>[]) {
  const count = (status: string) => results.filter((r) => r.status === status).length
  return {
    results,
    appliedCount: count('applied'),
    conflictCount: count('conflict'),
    rejectedCount: count('rejected'),
    hasFailures: count('conflict') + count('rejected') > 0,
  }
}

function remote(overrides: Record<string, unknown> = {}) {
  return {
    promptId: 'p1',
    title: 'Bản khác',
    content: 'Khác',
    description: null,
    categoryId: null,
    categoryName: null,
    version: 2,
    hasConflict: true,
    isDeleted: false,
    tags: [],
    variables: [],
    ...overrides,
  }
}

async function seedPrompt(id: string, version = 0, category: string | null = 'Marketing') {
  const db = await getDb()
  await db.runAsync(
    `INSERT INTO prompts (id, space_id, title, content, category, created_at, updated_at, version)
     VALUES (?, ?, 'Tiêu đề', 'Nội dung', ?, 1, 1, ?)`,
    id,
    SPACE,
    category,
    version,
  )
}

beforeEach(async () => {
  post.mockReset()
  const db = await getDb()
  await db.execAsync(
    'DELETE FROM prompts; DELETE FROM sync_outbox; DELETE FROM sync_conflicts; DELETE FROM sync_state;',
  )
  await db.runAsync(
    "INSERT OR IGNORE INTO spaces (id, kind, name, can_manage, created_at) VALUES (?, 'personal', 'P', 1, 1)",
    SPACE,
  )
})

describe('pushSpace', () => {
  it('sends the AioKin request shape and applies newVersion from the batch response', async () => {
    const db = await getDb()
    await seedPrompt('p1')
    await enqueue(db, SPACE, 'p1', 'insert', 0)
    post.mockResolvedValue(batch([{ promptId: 'p1', status: 'applied', newVersion: 1 }]))

    const outcome = await pushSpace(SPACE)

    expect(post).toHaveBeenCalledWith(
      '/sync/push',
      {
        spaceUuid: SPACE,
        entities: [
          {
            promptId: 'p1',
            operation: 'insert',
            baseVersion: 0,
            payload: {
              title: 'Tiêu đề',
              content: 'Nội dung',
              categoryId: await categoryIdFor(SPACE, 'Marketing'),
              categoryName: 'Marketing',
            },
          },
        ],
      },
      { auth: true },
    )
    const body = post.mock.calls[0]![1]
    expect(body).not.toHaveProperty('deviceId') // device comes from the session (spec §0 C4)
    expect(body.entities[0].payload).not.toHaveProperty('tags') // omitted = unchanged (C6)
    expect(body.entities[0].payload).not.toHaveProperty('variables')
    // Backend follow-up (25cf356): description is now omit-means-unchanged, same as category.
    // This app has no local description column (schema v3, drift D1) — omitting the field
    // entirely means editing a prompt here no longer erases a description set elsewhere.
    expect(body.entities[0].payload).not.toHaveProperty('description')
    expect(outcome).toEqual({ applied: 1, conflicts: 0, rejected: 0, remaining: false })
    expect(await db.getFirstAsync('SELECT version FROM prompts WHERE id = ?', 'p1')).toEqual({ version: 1 })
    expect(await db.getFirstAsync('SELECT seq FROM sync_outbox')).toBeNull()
  })

  it('clears the category only on an update whose category is empty', async () => {
    const db = await getDb()
    await seedPrompt('new', 0, null)
    await seedPrompt('old', 3, null)
    await enqueue(db, SPACE, 'new', 'insert', 0)
    await enqueue(db, SPACE, 'old', 'update', 3)
    post.mockResolvedValue(
      batch([
        { promptId: 'new', status: 'applied', newVersion: 1 },
        { promptId: 'old', status: 'applied', newVersion: 4 },
      ]),
    )

    await pushSpace(SPACE)

    const [insert, update] = post.mock.calls[0]![1].entities
    expect(insert.payload).toEqual({ title: 'Tiêu đề', content: 'Nội dung' })
    expect(update.payload).toEqual({
      title: 'Tiêu đề',
      content: 'Nội dung',
      clearCategory: true,
    })
  })

  it('rebases an edit made while the insert was in flight and asks for another round', async () => {
    const db = await getDb()
    await seedPrompt('p1')
    await enqueue(db, SPACE, 'p1', 'insert', 0)
    post.mockImplementation(async () => {
      await enqueue(db, SPACE, 'p1', 'update', 0) // user edits during the request
      return batch([{ promptId: 'p1', status: 'applied', newVersion: 1 }])
    })

    const outcome = await pushSpace(SPACE)

    expect(outcome.remaining).toBe(true)
    expect(await db.getAllAsync('SELECT operation, base_version FROM sync_outbox')).toEqual([
      { operation: 'update', base_version: 1 },
    ])
  })

  it('stores a real conflict for the user', async () => {
    const db = await getDb()
    await seedPrompt('p1', 1)
    await enqueue(db, SPACE, 'p1', 'update', 1)
    post.mockResolvedValue(batch([{ promptId: 'p1', status: 'conflict', conflictId: 'c-1', remote: remote() }]))

    const outcome = await pushSpace(SPACE)

    expect(outcome.conflicts).toBe(1)
    const conflict = await db.getFirstAsync<{ remote_version: number; local_payload: string; remote_payload: string }>(
      "SELECT remote_version, local_payload, remote_payload FROM sync_conflicts WHERE conflict_id = 'c-1'",
    )
    expect(conflict?.remote_version).toBe(2)
    expect(JSON.parse(conflict!.local_payload).title).toBe('Tiêu đề')
    expect(JSON.parse(conflict!.remote_payload).isDeleted).toBe(false)
    expect(await db.getFirstAsync('SELECT has_conflict FROM prompts WHERE id = ?', 'p1')).toEqual({ has_conflict: 1 })
  })

  it('auto-resolves a conflict whose remote already holds exactly what we sent', async () => {
    const db = await getDb()
    await seedPrompt('p1', 1)
    await enqueue(db, SPACE, 'p1', 'update', 1)
    post
      .mockResolvedValueOnce(
        batch([
          {
            promptId: 'p1',
            status: 'conflict',
            conflictId: 'c-2',
            remote: remote({ title: 'Tiêu đề', content: 'Nội dung', categoryId: await categoryIdFor(SPACE, 'Marketing'), version: 2 }),
          },
        ]),
      )
      .mockResolvedValueOnce({ promptId: 'p1', newVersion: 2, isDeleted: false }) // ResolveConflictResponse

    const outcome = await pushSpace(SPACE)

    expect(post).toHaveBeenLastCalledWith('/sync/conflicts/c-2/resolve', { resolution: 'keep_remote' }, { auth: true })
    expect(outcome).toMatchObject({ applied: 1, conflicts: 0 })
    expect(await db.getFirstAsync('SELECT conflict_id FROM sync_conflicts')).toBeNull()
    expect(await db.getFirstAsync('SELECT version, has_conflict FROM prompts WHERE id = ?', 'p1')).toEqual({
      version: 2,
      has_conflict: 0,
    })
  })

  it('auto-resolves our delete against a prompt that is already deleted remotely', async () => {
    const db = await getDb()
    await enqueue(db, SPACE, 'gone', 'delete', 1)
    post
      .mockResolvedValueOnce(
        batch([{ promptId: 'gone', status: 'conflict', conflictId: 'c-3', remote: remote({ promptId: 'gone', isDeleted: true }) }]),
      )
      .mockResolvedValueOnce({ promptId: 'gone', newVersion: 2, isDeleted: true })

    const outcome = await pushSpace(SPACE)

    expect(outcome).toMatchObject({ applied: 1, conflicts: 0 })
    expect(await db.getFirstAsync('SELECT seq FROM sync_outbox')).toBeNull()
    expect(await db.getFirstAsync('SELECT conflict_id FROM sync_conflicts')).toBeNull()
  })

  it('a permission rejection drops the row and forces a snapshot to restore the server copy', async () => {
    const db = await getDb()
    await seedPrompt('p1', 3)
    await db.runAsync("INSERT INTO sync_state (space_id, cursor) VALUES (?, 77)", SPACE)
    await enqueue(db, SPACE, 'p1', 'update', 3)
    post.mockResolvedValue(
      batch([{ promptId: 'p1', status: 'rejected', error: 'Ban khong co quyen sua prompt nay.' }]),
    )

    const outcome = await pushSpace(SPACE)

    expect(outcome).toMatchObject({ applied: 0, rejected: 1, remaining: false })
    expect(await db.getFirstAsync('SELECT seq FROM sync_outbox')).toBeNull()
    expect(await db.getFirstAsync('SELECT cursor FROM sync_state WHERE space_id = ?', SPACE)).toEqual({ cursor: 0 })
  })

  it('any other rejection keeps the row for a later run and skips it for the rest of this run', async () => {
    const db = await getDb()
    await seedPrompt('p1')
    await enqueue(db, SPACE, 'p1', 'insert', 0)
    post.mockResolvedValue(batch([{ promptId: 'p1', status: 'rejected', error: 'Khong the ap dung thay doi nay.' }]))
    const skipSeqs = new Set<number>()

    const first = await pushSpace(SPACE, { skipSeqs })
    const second = await pushSpace(SPACE, { skipSeqs })

    expect(first.rejected).toBe(1)
    expect(second).toEqual({ applied: 0, conflicts: 0, rejected: 0, remaining: false })
    expect(post).toHaveBeenCalledTimes(1)
    expect(await db.getFirstAsync('SELECT in_flight, attempts, last_error FROM sync_outbox')).toEqual({
      in_flight: 0,
      attempts: 1,
      last_error: 'rejected: Khong the ap dung thay doi nay.',
    })
  })

  it('releases the batch and rethrows when the request fails', async () => {
    const db = await getDb()
    await seedPrompt('p1')
    await enqueue(db, SPACE, 'p1', 'insert', 0)
    post.mockRejectedValue(Object.assign(new Error('offline'), { code: 'network' }))

    await expect(pushSpace(SPACE)).rejects.toThrow('offline')
    expect(await db.getFirstAsync('SELECT in_flight, attempts FROM sync_outbox')).toEqual({
      in_flight: 0,
      attempts: 1,
    })
  })

  it('holds back a locally deleted prompt that has an unresolved conflict', async () => {
    const db = await getDb()
    // No prompts row (deleted locally), so claimBatch's has_conflict filter can't see the conflict.
    await db.runAsync(
      "INSERT INTO sync_conflicts (conflict_id, space_id, prompt_id, local_payload, remote_payload, remote_version, created_at) VALUES ('c-4', ?, 'p1', NULL, '{}', 2, 1)",
      SPACE,
    )
    await enqueue(db, SPACE, 'p1', 'delete', 1)

    const outcome = await pushSpace(SPACE)

    expect(post).not.toHaveBeenCalled()
    expect(outcome.remaining).toBe(false)
    expect(await db.getFirstAsync('SELECT in_flight FROM sync_outbox')).toEqual({ in_flight: 0 })
  })
})
