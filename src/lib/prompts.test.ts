jest.mock('expo-crypto', () => {
  let counter = 0
  return {
    randomUUID: jest.fn(() => `test-uuid-${(counter += 1)}`),
  }
})

import { getDb, LOCAL_SPACE_ID } from './db'
import { pendingCount } from './outbox'
import {
  createPrompt,
  deletePrompt,
  getPrompt,
  listPrompts,
  recordCopy,
  setFavorite,
  setPromptWriteListener,
  updatePrompt,
} from './prompts'

describe('prompts', () => {
  it('creates, reads, updates and deletes a prompt', async () => {
    const created = await createPrompt({
      spaceId: LOCAL_SPACE_ID,
      title: 'Viết caption Instagram',
      content: 'Tạo caption ngắn gọn cho bài đăng.',
      category: 'Marketing',
    })
    expect(created.isFavorite).toBe(false)
    expect(created.copyCount).toBe(0)

    const fetched = await getPrompt(created.id)
    expect(fetched?.title).toBe('Viết caption Instagram')

    await updatePrompt(created.id, {
      title: 'Viết caption TikTok',
      content: 'Nội dung mới.',
      category: 'Content',
    })
    const updated = await getPrompt(created.id)
    expect(updated?.title).toBe('Viết caption TikTok')
    expect(updated?.category).toBe('Content')

    await deletePrompt(created.id)
    expect(await getPrompt(created.id)).toBeNull()
  })

  it('toggles favorite and counts copies', async () => {
    const prompt = await createPrompt({
      spaceId: LOCAL_SPACE_ID,
      title: 'Tóm tắt bài viết',
      content: 'Tóm tắt nội dung dài.',
      category: 'Năng suất',
    })

    await setFavorite(prompt.id, true)
    expect((await getPrompt(prompt.id))?.isFavorite).toBe(true)

    const count = await recordCopy(prompt.id)
    expect(count).toBe(1)
    expect(await recordCopy(prompt.id)).toBe(2)
  })

  it('filters by category, favorites and full-text query', async () => {
    const marketing = await createPrompt({
      spaceId: LOCAL_SPACE_ID,
      title: 'Kịch bản video TikTok',
      content: 'Lên kịch bản 30 giây giới thiệu sản phẩm.',
      category: 'Marketing',
    })
    const content = await createPrompt({
      spaceId: LOCAL_SPACE_ID,
      title: 'Bài đăng blog',
      content: 'Không liên quan tới tìm kiếm.',
      category: 'Content',
    })
    await setFavorite(marketing.id, true)

    const byCategory = await listPrompts(LOCAL_SPACE_ID, { category: 'Marketing' })
    expect(byCategory.map((p) => p.id)).toContain(marketing.id)
    expect(byCategory.map((p) => p.id)).not.toContain(content.id)

    const favorites = await listPrompts(LOCAL_SPACE_ID, { favoritesOnly: true })
    expect(favorites.map((p) => p.id)).toContain(marketing.id)
    expect(favorites.map((p) => p.id)).not.toContain(content.id)

    const searched = await listPrompts(LOCAL_SPACE_ID, { query: 'TikTok' })
    expect(searched.map((p) => p.id)).toContain(marketing.id)
    expect(searched.map((p) => p.id)).not.toContain(content.id)
  })
})

// Fix round 1, Task 14: the backend permanently rejects a title over 200 chars or a category
// name over 80 chars (AioKin SyncService.cs ValidatePayload, :1257/:1266), but the push client
// currently can't tell that rejection apart from a transient one by message text alone (gap
// G14) — it would retry forever. These guards stop an over-limit prompt from ever reaching the
// outbox in the first place, on a synced space where an outbox row would actually be enqueued.
describe('sync length limits (gap G14 guard)', () => {
  const SPACE = 'aaaaaaaa-0000-4000-8000-000000000099'

  beforeEach(async () => {
    const db = await getDb()
    await db.execAsync('DELETE FROM sync_outbox')
    await db.runAsync(
      "INSERT OR IGNORE INTO spaces (id, kind, name, can_manage, created_at) VALUES (?, 'personal', 'S', 1, 1)",
      SPACE,
    )
  })

  it('rejects a title over 200 characters before it ever reaches the outbox', async () => {
    const db = await getDb()
    const title = 'x'.repeat(201)

    await expect(
      createPrompt({ spaceId: SPACE, title, content: 'Nội dung', category: null }),
    ).rejects.toThrow('title_too_long')

    expect(await pendingCount(db)).toBe(0)
    expect(await listPrompts(SPACE)).toEqual([])
  })

  it('rejects a category name over 80 characters before it ever reaches the outbox', async () => {
    const db = await getDb()
    const category = 'y'.repeat(81)

    await expect(
      createPrompt({ spaceId: SPACE, title: 'Tiêu đề', content: 'Nội dung', category }),
    ).rejects.toThrow('category_too_long')

    expect(await pendingCount(db)).toBe(0)
  })

  it('also guards an update that would push a title over the limit, leaving the prompt untouched', async () => {
    const prompt = await createPrompt({
      spaceId: SPACE,
      title: 'Tiêu đề ngắn',
      content: 'Nội dung',
      category: null,
    })
    const db = await getDb()
    const before = await pendingCount(db)

    await expect(
      updatePrompt(prompt.id, { title: 'z'.repeat(201), content: 'Nội dung', category: null }),
    ).rejects.toThrow('title_too_long')

    expect(await pendingCount(db)).toBe(before) // no new outbox row from the rejected update
    expect((await getPrompt(prompt.id))?.title).toBe('Tiêu đề ngắn') // unchanged
  })

  it('allows a title and category exactly at the limit', async () => {
    const title = 'x'.repeat(200)
    const category = 'y'.repeat(80)

    const created = await createPrompt({ spaceId: SPACE, title, content: 'Nội dung', category })

    expect(created.title).toHaveLength(200)
    const db = await getDb()
    expect(await pendingCount(db)).toBe(1)
  })
})

describe('prompts in a synced space', () => {
  const SPACE = 'aaaaaaaa-0000-4000-8000-00000000000a'

  beforeAll(async () => {
    const db = await getDb()
    await db.runAsync(
      "INSERT OR IGNORE INTO spaces (id, kind, name, can_manage, created_at) VALUES (?, 'personal', 'P', 1, 1)",
      SPACE,
    )
  })

  async function outboxFor(promptId: string) {
    const db = await getDb()
    return db.getAllAsync<{ operation: string }>(
      'SELECT operation FROM sync_outbox WHERE prompt_id = ? ORDER BY seq',
      promptId,
    )
  }

  it('create + edit queue one insert and notify the write listener', async () => {
    const listener = jest.fn()
    setPromptWriteListener(listener)

    const created = await createPrompt({ spaceId: SPACE, title: 'A', content: 'B', category: null })
    await updatePrompt(created.id, { title: 'A2', content: 'B2', category: 'Marketing' })

    expect(await outboxFor(created.id)).toEqual([{ operation: 'insert' }])
    expect(listener).toHaveBeenCalledTimes(2)
    setPromptWriteListener(null)
  })

  it('create + delete leaves nothing to push', async () => {
    const created = await createPrompt({ spaceId: SPACE, title: 'A', content: 'B', category: null })
    await deletePrompt(created.id)
    expect(await outboxFor(created.id)).toEqual([])
  })

  it('local-space writes never touch the outbox', async () => {
    const created = await createPrompt({ spaceId: LOCAL_SPACE_ID, title: 'A', content: 'B', category: null })
    expect(await outboxFor(created.id)).toEqual([])
  })
})
