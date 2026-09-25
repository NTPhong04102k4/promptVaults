jest.mock('expo-crypto', () => {
  let counter = 0
  return {
    randomUUID: jest.fn(() => `test-uuid-${(counter += 1)}`),
  }
})

import { getDb, LOCAL_SPACE_ID } from './db'
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
