jest.mock('expo-crypto', () => {
  let counter = 0
  return {
    randomUUID: jest.fn(() => `test-uuid-${(counter += 1)}`),
  }
})

import { PERSONAL_VAULT_ID } from './db'
import {
  createPrompt,
  deletePrompt,
  getPrompt,
  listPrompts,
  recordCopy,
  setFavorite,
  updatePrompt,
} from './prompts'

describe('prompts', () => {
  it('creates, reads, updates and deletes a prompt', async () => {
    const created = await createPrompt({
      vaultId: PERSONAL_VAULT_ID,
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
      vaultId: PERSONAL_VAULT_ID,
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
      vaultId: PERSONAL_VAULT_ID,
      title: 'Kịch bản video TikTok',
      content: 'Lên kịch bản 30 giây giới thiệu sản phẩm.',
      category: 'Marketing',
    })
    const content = await createPrompt({
      vaultId: PERSONAL_VAULT_ID,
      title: 'Bài đăng blog',
      content: 'Không liên quan tới tìm kiếm.',
      category: 'Content',
    })
    await setFavorite(marketing.id, true)

    const byCategory = await listPrompts(PERSONAL_VAULT_ID, { category: 'Marketing' })
    expect(byCategory.map((p) => p.id)).toContain(marketing.id)
    expect(byCategory.map((p) => p.id)).not.toContain(content.id)

    const favorites = await listPrompts(PERSONAL_VAULT_ID, { favoritesOnly: true })
    expect(favorites.map((p) => p.id)).toContain(marketing.id)
    expect(favorites.map((p) => p.id)).not.toContain(content.id)

    const searched = await listPrompts(PERSONAL_VAULT_ID, { query: 'TikTok' })
    expect(searched.map((p) => p.id)).toContain(marketing.id)
    expect(searched.map((p) => p.id)).not.toContain(content.id)
  })
})
