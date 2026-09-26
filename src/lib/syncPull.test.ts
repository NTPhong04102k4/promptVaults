jest.mock('@/services/apiClient', () => ({ apiClient: { get: jest.fn() } }))
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, value: string) =>
    require('crypto').createHash('sha256').update(value).digest('hex'),
}))

import { apiClient } from '@/services/apiClient'

import { categoryIdFor } from './categoryId'
import { getDb } from './db'
import { enqueue } from './outbox'
import { getCursor, pullSpace } from './syncPull'

const SPACE = 'aaaaaaaa-0000-4000-8000-000000000001'
const get = apiClient.get as jest.Mock

// AioKin SyncChangeItem / SyncPromptChangePayload (camelCase, typed — no raw row JSON).
function change(
  syncLogId: number,
  id: string,
  version: number,
  prompt: Record<string, unknown> | null,
  extra: Record<string, unknown> = {},
) {
  return {
    syncLogId,
    entityType: 'prompt',
    entityId: id,
    operation: 'update',
    version,
    tagsVariablesOnly: false,
    prompt:
      prompt === null
        ? null
        : { description: null, categoryId: null, isDeleted: false, tags: [], variables: [], ...prompt },
    ...extra,
  }
}

function incremental(resumeCursor: number, changes: unknown[]) {
  return { isSnapshot: false, snapshotJson: null, resumeCursor, changes }
}

// Seeded rows are favourites with copy_count 9, to prove pull never touches them.
async function seed(id: string, title: string, version: number, category: string | null = null) {
  const db = await getDb()
  await db.runAsync(
    `INSERT INTO prompts (id, space_id, title, content, category, is_favorite, copy_count, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, 1, 9, 1, 1, ?)`,
    id,
    SPACE,
    title,
    title,
    category,
    version,
  )
}

beforeEach(async () => {
  get.mockReset()
  const db = await getDb()
  await db.execAsync(
    'DELETE FROM prompts; DELETE FROM sync_outbox; DELETE FROM sync_state; DELETE FROM sync_conflicts;',
  )
  await db.runAsync(
    "INSERT OR IGNORE INTO spaces (id, kind, name, can_manage, created_at) VALUES (?, 'personal', 'P', 1, 1)",
    SPACE,
  )
})

describe('pullSpace (snapshot — since = 0 always returns one)', () => {
  it('requests since=0 when no local cursor exists yet', async () => {
    get.mockResolvedValue({ isSnapshot: true, changes: [], resumeCursor: 0, snapshotJson: JSON.stringify({ Prompts: [] }) })

    await pullSpace(SPACE)

    expect(get).toHaveBeenCalledWith(`/sync/pull?spaceUuid=${SPACE}&since=0`, { auth: true })
  })

  it('parses the PascalCase snapshotJson, replaces the space and keeps device-local fields', async () => {
    await seed('keep', 'Old', 1)
    await seed('stale', 'x', 1)
    const categoryId = await categoryIdFor(SPACE, 'Marketing')
    get.mockResolvedValue({
      isSnapshot: true,
      changes: [],
      resumeCursor: 900,
      snapshotJson: JSON.stringify({
        SpaceUuid: SPACE,
        GeneratedAt: '2026-09-26T00:00:00Z',
        Prompts: [
          { PromptId: 'keep', Title: 'T-keep', Content: 'C', Description: null, CategoryId: categoryId, Version: 7, Tags: [], Variables: [] },
          { PromptId: 'new', Title: 'T-new', Content: 'C', Description: null, CategoryId: null, Version: 2, Tags: [], Variables: [] },
        ],
      }),
    })

    const result = await pullSpace(SPACE)

    expect(result).toEqual({ applied: 2, snapshot: true })
    const db = await getDb()
    expect(await db.getAllAsync('SELECT id, title, category, is_favorite, version FROM prompts ORDER BY id')).toEqual([
      { id: 'keep', title: 'T-keep', category: 'Marketing', is_favorite: 1, version: 7 },
      { id: 'new', title: 'T-new', category: null, is_favorite: 0, version: 2 },
    ])
    // 'stale' is gone: the snapshot fully replaces local state for the space.
    expect(await db.getFirstAsync("SELECT id FROM prompts WHERE id = 'stale'")).toBeNull()
    expect(await getCursor(SPACE)).toBe(900)
  })

  it('never touches prompts with pending changes or an open conflict', async () => {
    await seed('pending', 'Mine', 1)
    await seed('conflicted', 'Mine too', 1)
    const db = await getDb()
    await enqueue(db, SPACE, 'pending', 'update', 1)
    await db.runAsync(
      "INSERT INTO sync_conflicts (conflict_id, space_id, prompt_id, local_payload, remote_payload, remote_version, created_at) VALUES ('c', ?, 'conflicted', NULL, '{}', 2, 1)",
      SPACE,
    )
    get.mockResolvedValue({ isSnapshot: true, changes: [], resumeCursor: 5, snapshotJson: JSON.stringify({ Prompts: [] }) })

    await pullSpace(SPACE)

    // A pull row for the SAME entity as a locally-conflicted prompt must never overwrite it.
    expect(await db.getAllAsync('SELECT id, title FROM prompts ORDER BY id')).toEqual([
      { id: 'conflicted', title: 'Mine too' },
      { id: 'pending', title: 'Mine' },
    ])
  })
})

describe('pullSpace (incremental)', () => {
  beforeEach(async () => {
    const db = await getDb()
    await db.runAsync('INSERT INTO sync_state (space_id, cursor) VALUES (?, 10)', SPACE)
  })

  it('requests since=<stored cursor> once one exists', async () => {
    get.mockResolvedValue(incremental(10, []))

    await pullSpace(SPACE)

    expect(get).toHaveBeenCalledWith(`/sync/pull?spaceUuid=${SPACE}&since=10`, { auth: true })
  })

  it('inserts new prompts, maps a derived category id and stores the cursor', async () => {
    const categoryId = await categoryIdFor(SPACE, 'Marketing')
    get.mockResolvedValue(
      incremental(42, [change(42, 'p1', 3, { title: 'T', content: 'C', categoryId }, { operation: 'insert' })]),
    )

    const result = await pullSpace(SPACE)

    expect(result).toEqual({ applied: 1, snapshot: false })
    const db = await getDb()
    expect(await db.getFirstAsync('SELECT title, category, version FROM prompts WHERE id = ?', 'p1')).toEqual({
      title: 'T',
      category: 'Marketing',
      version: 3,
    })
    expect(await getCursor(SPACE)).toBe(42)
  })

  it('names categories created by other clients via /prompts/categories, fetched once', async () => {
    const foreign = '11111111-1111-4111-8111-111111111111'
    get.mockImplementation(async (path: string) =>
      path.startsWith('/prompts/categories')
        ? [{ id: foreign.toUpperCase(), name: 'Du lịch' }]
        : incremental(3, [
            change(2, 'a', 1, { title: 'A', content: 'A', categoryId: foreign }),
            change(3, 'b', 1, { title: 'B', content: 'B', categoryId: foreign }),
          ]),
    )

    await pullSpace(SPACE)

    expect(get).toHaveBeenCalledWith(`/prompts/categories?spaceUuid=${SPACE}`, { auth: true })
    expect(get.mock.calls.filter(([p]) => String(p).startsWith('/prompts/categories'))).toHaveLength(1)
    const db = await getDb()
    expect(await db.getAllAsync('SELECT id, category FROM prompts ORDER BY id')).toEqual([
      { id: 'a', category: 'Du lịch' },
      { id: 'b', category: 'Du lịch' },
    ])
  })

  it('keeps the local category when an id cannot be named', async () => {
    await seed('p1', 'Old', 1, 'Marketing')
    get.mockImplementation(async (path: string) =>
      path.startsWith('/prompts/categories')
        ? []
        : incremental(3, [change(3, 'p1', 2, { title: 'New', content: 'New', categoryId: '22222222-2222-4222-8222-222222222222' })]),
    )

    await pullSpace(SPACE)

    const db = await getDb()
    expect(await db.getFirstAsync("SELECT title, category FROM prompts WHERE id = 'p1'")).toEqual({
      title: 'New',
      category: 'Marketing',
    })
  })

  it('updates content but keeps device-local favourite and copy count, and does not touch the outbox', async () => {
    await seed('p1', 'Old', 1)
    get.mockResolvedValue(incremental(5, [change(5, 'p1', 2, { title: 'New', content: 'New' })]))

    await pullSpace(SPACE)

    const db = await getDb()
    expect(
      await db.getFirstAsync('SELECT title, is_favorite, copy_count, version FROM prompts WHERE id = ?', 'p1'),
    ).toEqual({ title: 'New', is_favorite: 1, copy_count: 9, version: 2 })
    // Applying a pull change must never re-enqueue it as an outbox row (infinite sync loop guard).
    expect(await db.getAllAsync('SELECT * FROM sync_outbox')).toEqual([])
  })

  it('applies soft deletes (update + isDeleted) and hard deletes (prompt null)', async () => {
    await seed('soft', 'x', 1)
    await seed('hard', 'x', 1)
    get.mockResolvedValue(
      incremental(8, [
        change(7, 'soft', 2, { title: 'x', content: 'x', isDeleted: true }),
        change(8, 'hard', 2, null, { operation: 'delete' }),
      ]),
    )

    await pullSpace(SPACE)

    const db = await getDb()
    expect(await db.getAllAsync('SELECT id FROM prompts ORDER BY id')).toEqual([])
  })

  it('never downgrades: a strictly-newer local version wins over a stale incoming change', async () => {
    await seed('newer', 'Mine', 5)
    get.mockResolvedValue(incremental(9, [change(9, 'newer', 4, { title: 'Stale', content: 'Stale' })]))

    await pullSpace(SPACE)

    const db = await getDb()
    expect(await db.getFirstAsync("SELECT title, version FROM prompts WHERE id = 'newer'")).toEqual({
      title: 'Mine',
      version: 5,
    })
  })

  // Verified against the live backend (SyncService.cs / db/init-postgres.sql, commit 7bd1ba6,
  // "AddPromptMetaSig"): the vault.prompts before-update trigger bumps `version` by exactly 1
  // on ANY row it fires for (title/content/description/category_id/is_deleted/meta_sig
  // changed), and tag/variable-only pushes now go through the SAME trigger (via a synthetic
  // meta_sig column touch) instead of the old manual "kind":"tags_variables" sync_log row. Two
  // sync_log rows for one entity can therefore no longer legitimately share a version — the old
  // P12-era workaround (gate with `version >=`, because a tags-only row kept the old version)
  // no longer applies. This app uses a strict `version >` gate; an equal-or-lower incoming
  // version is never applied.
  it('does not apply an incoming change whose version merely equals the local version', async () => {
    await seed('p1', 'Local', 3)
    get.mockResolvedValue(incremental(11, [change(11, 'p1', 3, { title: 'Should not win', content: 'x' })]))

    await pullSpace(SPACE)

    const db = await getDb()
    expect(await db.getFirstAsync("SELECT title, version FROM prompts WHERE id = 'p1'")).toEqual({
      title: 'Local',
      version: 3,
    })
  })

  // tagsVariablesOnly is now a dead flag in practice (the backend no longer sets it — see the
  // note above) but the DTO still carries it, so keep skipping it defensively: if it were ever
  // true, the accompanying prompt payload is a live-row hydration, not real history, and must
  // never be applied verbatim.
  it('ignores a tagsVariablesOnly row even when it carries the highest version', async () => {
    await seed('p1', 'Old', 3)
    get.mockResolvedValue(
      incremental(13, [
        change(12, 'p1', 4, { title: 'LIVE ROW — must not be applied', content: 'x' }, { tagsVariablesOnly: true }),
        change(13, 'p1', 5, { title: 'Real update', content: 'y' }),
      ]),
    )

    const result = await pullSpace(SPACE)

    expect(result.applied).toBe(1)
    const db = await getDb()
    expect(await db.getFirstAsync("SELECT title, version FROM prompts WHERE id = 'p1'")).toEqual({
      title: 'Real update',
      version: 5,
    })
    expect(await getCursor(SPACE)).toBe(13)
  })

  it('skips prompts with pending local changes but still advances the cursor', async () => {
    await seed('p1', 'Mine', 1)
    const db = await getDb()
    await enqueue(db, SPACE, 'p1', 'update', 1)
    get.mockResolvedValue(incremental(13, [change(13, 'p1', 2, { title: 'Theirs', content: 'Theirs' })]))

    await pullSpace(SPACE)

    expect(await db.getFirstAsync("SELECT title FROM prompts WHERE id = 'p1'")).toEqual({ title: 'Mine' })
    expect(await getCursor(SPACE)).toBe(13)
  })

  it('skips a prompt with an open conflict but still advances the cursor', async () => {
    await seed('p1', 'Mine', 1)
    const db = await getDb()
    await db.runAsync(
      "INSERT INTO sync_conflicts (conflict_id, space_id, prompt_id, local_payload, remote_payload, remote_version, created_at) VALUES ('c1', ?, 'p1', NULL, '{}', 2, 1)",
      SPACE,
    )
    get.mockResolvedValue(incremental(20, [change(20, 'p1', 2, { title: 'Theirs', content: 'Theirs' })]))

    await pullSpace(SPACE)

    expect(await db.getFirstAsync("SELECT title FROM prompts WHERE id = 'p1'")).toEqual({ title: 'Mine' })
    expect(await getCursor(SPACE)).toBe(20)
  })
})
