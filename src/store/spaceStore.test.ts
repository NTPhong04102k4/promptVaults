const mockStorage = new Map<string, string>()
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value)
    },
    removeItem: async (key: string) => {
      mockStorage.delete(key)
    },
  },
}))

import { LOCAL_SPACE_ID } from '@/lib/db'

import { useSpaceStore } from './spaceStore'

beforeEach(() => useSpaceStore.getState().reset())

describe('spaceStore', () => {
  it('starts on the local space with no owner', () => {
    expect(useSpaceStore.getState().currentSpaceId).toBe(LOCAL_SPACE_ID)
    expect(useSpaceStore.getState().ownerUserId).toBeNull()
  })

  it('persists the current space and owner', async () => {
    useSpaceStore.getState().setCurrentSpace('space-1')
    useSpaceStore.getState().setOwner('user-1')
    await Promise.resolve()
    expect(JSON.parse(mockStorage.get('space-store')!).state).toEqual({
      currentSpaceId: 'space-1',
      ownerUserId: 'user-1',
    })
  })

  it('reset returns to the local space', () => {
    useSpaceStore.getState().setCurrentSpace('space-1')
    useSpaceStore.getState().reset()
    expect(useSpaceStore.getState().currentSpaceId).toBe(LOCAL_SPACE_ID)
  })
})
