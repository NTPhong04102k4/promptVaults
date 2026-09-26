jest.mock('@/services/apiClient', () => {
  class ApiError extends Error {
    status: number
    code: string
    constructor(status: number, code: string, message: string) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  return { ApiError, apiClient: { post: jest.fn() } }
})
jest.mock('./syncEngine', () => ({ runSync: jest.fn(async () => undefined) }))
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, value: string) =>
    require('crypto').createHash('sha256').update(value).digest('hex'),
}))

import { apiClient, ApiError } from '@/services/apiClient'

import {
  getConflictForPrompt,
  resolveKeepLocal,
  resolveKeepRemote,
  resolveMerged,
} from './conflicts'
import { getDb } from './db'
import { runSync } from './syncEngine'

const SPACE = 'aaaaaaaa-0000-4000-8000-000000000001'
const post = apiClient.post as jest.Mock
const CONFLICT_AT = 1_000

function remote(overrides: Record<string, unknown> = {}) {
  return {
    promptId: 'p1',
    title: 'Máy chủ',
    content: 'Nội dung máy chủ',
    description: null,
    categoryId: null,
    categoryName: null,
    version: 4,
    isDeleted: false,
    ...overrides,
  }
}

async function seed({ withLocalRow = true, localUpdatedAt = 500, remoteDeleted = false } = {}) {
  const db = await getDb()
  if (withLocalRow) {
    await db.runAsync(
      `INSERT INTO prompts (id, space_id, title, content, category, created_at, updated_at, version, has_conflict)
       VALUES ('p1', ?, 'Của tôi', 'Nội dung của tôi', 'Marketing', 1, ?, 3, 1)`,
      SPACE,
      localUpdatedAt,
    )
  }
  await db.runAsync(
    `INSERT INTO sync_conflicts (conflict_id, space_id, prompt_id, local_payload, remote_payload, remote_version, created_at)
     VALUES ('c-1', ?, 'p1', ?, ?, 4, ?)`,
    SPACE,
    withLocalRow ? JSON.stringify({ title: 'Của tôi', content: 'Nội dung của tôi', description: null }) : null,
    JSON.stringify(remote({ isDeleted: remoteDeleted })),
    CONFLICT_AT,
  )
  await db.runAsync(
    "INSERT INTO sync_outbox (space_id, prompt_id, operation, base_version, created_at) VALUES (?, 'p1', 'update', 3, 1)",
    SPACE,
  )
}

beforeEach(async () => {
  post.mockReset()
  ;(runSync as jest.Mock).mockClear()
  const db = await getDb()
  await db.execAsync('DELETE FROM prompts; DELETE FROM sync_outbox; DELETE FROM sync_conflicts; DELETE FROM sync_state;')
  await db.runAsync(
    "INSERT OR IGNORE INTO spaces (id, kind, name, can_manage, created_at) VALUES (?, 'personal', 'P', 1, 1)",
    SPACE,
  )
})

async function state() {
  const db = await getDb()
  return {
    prompt: await db.getFirstAsync('SELECT title, version, has_conflict FROM prompts WHERE id = ?', 'p1'),
    outbox: await db.getAllAsync('SELECT operation, base_version FROM sync_outbox'),
    conflict: await db.getFirstAsync('SELECT conflict_id FROM sync_conflicts'),
  }
}

describe('conflicts', () => {
  it('keep_remote writes the server copy with the returned version', async () => {
    await seed()
    post.mockResolvedValue({ promptId: 'p1', newVersion: 4, isDeleted: false })

    expect(await resolveKeepRemote((await getConflictForPrompt('p1'))!)).toBe('resolved')

    expect(post).toHaveBeenCalledWith('/sync/conflicts/c-1/resolve', { resolution: 'keep_remote' }, { auth: true })
    expect(await state()).toEqual({
      prompt: { title: 'Máy chủ', version: 4, has_conflict: 0 },
      outbox: [],
      conflict: null,
    })
    expect(runSync).toHaveBeenCalled()
  })

  it('keep_remote on a remotely deleted prompt deletes it locally', async () => {
    await seed({ remoteDeleted: true })
    post.mockResolvedValue({ promptId: 'p1', newVersion: 4, isDeleted: true })

    await resolveKeepRemote((await getConflictForPrompt('p1'))!)

    expect((await state()).prompt).toBeNull()
  })

  it('keep_local when the local row is unchanged since the conflict', async () => {
    await seed({ localUpdatedAt: 500 })
    post.mockResolvedValue({ promptId: 'p1', newVersion: 5, isDeleted: false })

    await resolveKeepLocal((await getConflictForPrompt('p1'))!)

    expect(post).toHaveBeenCalledWith('/sync/conflicts/c-1/resolve', { resolution: 'keep_local' }, { auth: true })
    expect((await state()).prompt).toEqual({ title: 'Của tôi', version: 5, has_conflict: 0 })
  })

  it('sends the current row as merged when it was edited after the conflict', async () => {
    await seed({ localUpdatedAt: 2_000 })
    post.mockResolvedValue({ promptId: 'p1', newVersion: 5, isDeleted: false })

    await resolveKeepLocal((await getConflictForPrompt('p1'))!)

    const body = post.mock.calls[0]![1]
    expect(body.resolution).toBe('merged')
    expect(body.mergedPayload).toMatchObject({ title: 'Của tôi', content: 'Nội dung của tôi', categoryName: 'Marketing' })
    expect(body.mergedPayload).not.toHaveProperty('tags')
  })

  it('"Vẫn xoá": keep_local on a local delete lets the server delete it (gap G9 closed)', async () => {
    await seed({ withLocalRow: false })
    post.mockResolvedValue({ promptId: 'p1', newVersion: 5, isDeleted: true })

    await resolveKeepLocal((await getConflictForPrompt('p1'))!)

    expect(post).toHaveBeenCalledWith('/sync/conflicts/c-1/resolve', { resolution: 'keep_local' }, { auth: true })
    expect(await state()).toEqual({ prompt: null, outbox: [], conflict: null })
  })

  it('merged writes the chosen content locally and clears an emptied category', async () => {
    await seed()
    post.mockResolvedValue({ promptId: 'p1', newVersion: 5, isDeleted: false })

    await resolveMerged((await getConflictForPrompt('p1'))!, { title: 'Gộp', content: 'Cả hai', category: null })

    // buildPayload never sends `description` (Task 14, backend follow-up 25cf356: omit means
    // unchanged) — see src/lib/syncPush.test.ts:107. The brief's original expectation of an
    // explicit `description: null` predates that fix; matching it here would only assert a
    // stale shape, not a behavior difference (the server treats explicit null the same as
    // omitted — SyncService.DescriptionProvided checks `payload.Description is not null`).
    expect(post.mock.calls[0]![1]).toEqual({
      resolution: 'merged',
      mergedPayload: { title: 'Gộp', content: 'Cả hai', clearCategory: true },
    })
    expect((await state()).prompt).toEqual({ title: 'Gộp', version: 5, has_conflict: 0 })
  })

  it('403 on keep_local reports forbidden and changes nothing', async () => {
    await seed()
    post.mockRejectedValue(new ApiError(403, 'Forbidden', 'Ban khong co quyen sua prompt nay.'))

    expect(await resolveKeepLocal((await getConflictForPrompt('p1'))!)).toBe('forbidden')
    expect((await state()).conflict).toEqual({ conflict_id: 'c-1' })
  })

  it('409 re-queues the chosen content on the recorded remote version', async () => {
    await seed()
    post.mockRejectedValue(new ApiError(409, 'Conflict', 'Du lieu tren server da thay doi'))

    expect(await resolveKeepLocal((await getConflictForPrompt('p1'))!)).toBe('requeued')
    expect(await state()).toEqual({
      prompt: { title: 'Của tôi', version: 4, has_conflict: 0 },
      outbox: [{ operation: 'update', base_version: 4 }],
      conflict: null,
    })
  })

  it('404 on keep_remote forces a snapshot so the pull restores the server copy', async () => {
    await seed()
    const db = await getDb()
    await db.runAsync('INSERT INTO sync_state (space_id, cursor) VALUES (?, 50)', SPACE)
    post.mockRejectedValue(new ApiError(404, 'NotFound', 'Khong tim thay xung dot can xu ly.'))

    expect(await resolveKeepRemote((await getConflictForPrompt('p1'))!)).toBe('requeued')
    expect(await db.getFirstAsync('SELECT cursor FROM sync_state WHERE space_id = ?', SPACE)).toEqual({ cursor: 0 })
    expect((await state()).conflict).toBeNull()
  })

  it('leaves everything untouched when the server is unreachable', async () => {
    await seed()
    post.mockRejectedValue(new Error('offline'))
    await expect(resolveKeepRemote((await getConflictForPrompt('p1'))!)).rejects.toThrow('offline')
    expect((await state()).conflict).toEqual({ conflict_id: 'c-1' })
  })
})
