jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, value: string) =>
    require('crypto').createHash('sha256').update(value).digest('hex'),
}))

import { categoryIdFor, categoryNameFor } from './categoryId'

const UUID_V8 = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('categoryIdFor', () => {
  it('is a stable v8 UUID per (space, name)', async () => {
    const a = await categoryIdFor('space-1', 'Marketing')
    expect(a).toMatch(UUID_V8)
    expect(await categoryIdFor('space-1', ' marketing ')).toBe(a)
    expect(await categoryIdFor('space-2', 'Marketing')).not.toBe(a)
  })
})

describe('categoryNameFor', () => {
  it('maps an id produced by any device back to the app category', async () => {
    const id = await categoryIdFor('space-1', 'Năng suất')
    expect(await categoryNameFor('space-1', id.toUpperCase())).toBe('Năng suất')
  })

  it('returns null for ids created by other clients or no category', async () => {
    expect(await categoryNameFor('space-1', '11111111-1111-4111-8111-111111111111')).toBeNull()
    expect(await categoryNameFor('space-1', null)).toBeNull()
  })
})
