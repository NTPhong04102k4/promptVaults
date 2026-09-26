jest.mock('@/services/apiClient', () => ({ apiClient: { get: jest.fn() } }))
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

import { apiClient } from '@/services/apiClient'
import { useSpaceStore } from '@/store/spaceStore'

import { adoptLocalPrompts, clearSyncedData, countLocalPrompts, prepareSignedInUser } from './accountData'
import { getDb, LOCAL_SPACE_ID } from './db'
import { isSignOutPending, setSignOutPending } from './tokenStore'

const PERSONAL = 'aaaaaaaa-0000-4000-8000-000000000001'

beforeEach(async () => {
  useSpaceStore.getState().reset()
  ;(apiClient.get as jest.Mock).mockResolvedValue([
    { spaceUuid: PERSONAL, spaceType: 'Personal', name: 'Personal', canManage: true, createdAtMillis: 1 },
  ])
  const db = await getDb()
  await db.execAsync(
    "DELETE FROM prompts; DELETE FROM sync_outbox; DELETE FROM spaces WHERE kind <> 'local';",
  )
})

describe('prepareSignedInUser', () => {
  it('stores spaces, records the owner and switches to the personal space', async () => {
    const personal = await prepareSignedInUser('user-1')
    expect(personal?.id).toBe(PERSONAL)
    expect(useSpaceStore.getState()).toMatchObject({ currentSpaceId: PERSONAL, ownerUserId: 'user-1' })
  })

  it("wipes the previous account's synced data when a different user signs in", async () => {
    await prepareSignedInUser('user-1')
    const db = await getDb()
    await db.runAsync(
      "INSERT INTO prompts (id, space_id, title, content, created_at, updated_at) VALUES ('theirs', ?, 't', 'c', 1, 1)",
      PERSONAL,
    )

    await prepareSignedInUser('user-2')

    expect(await db.getFirstAsync("SELECT id FROM prompts WHERE id = 'theirs'")).toBeNull()
    expect(useSpaceStore.getState().ownerUserId).toBe('user-2')
  })

  // Task 17 fix round 5: a sign-out-pending marker left behind by a faulted sign-out must not
  // make the NEXT cold start sign out (and wipe) whoever legitimately signed in afterwards.
  it('clears a stale sign-out-pending marker once a user has signed in', async () => {
    await setSignOutPending(true)

    await prepareSignedInUser('user-2')

    expect(await isSignOutPending()).toBe(false)
  })

  it('clears the stale marker even when the spaces fetch fails (offline sign-in)', async () => {
    await setSignOutPending(true)
    ;(apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('offline'))

    await expect(prepareSignedInUser('user-2')).rejects.toThrow('offline')

    expect(await isSignOutPending()).toBe(false)
  })
})

describe('adoptLocalPrompts', () => {
  it('moves local prompts into the personal space and queues one insert each', async () => {
    await prepareSignedInUser('user-1')
    const db = await getDb()
    await db.runAsync(
      "INSERT INTO prompts (id, space_id, title, content, created_at, updated_at) VALUES ('a', ?, 't', 'c', 1, 1), ('b', ?, 't', 'c', 1, 1)",
      LOCAL_SPACE_ID,
      LOCAL_SPACE_ID,
    )
    expect(await countLocalPrompts()).toBe(2)

    expect(await adoptLocalPrompts(PERSONAL)).toBe(2)

    expect(await countLocalPrompts()).toBe(0)
    expect(await db.getAllAsync('SELECT prompt_id, operation, base_version FROM sync_outbox ORDER BY prompt_id')).toEqual([
      { prompt_id: 'a', operation: 'insert', base_version: 0 },
      { prompt_id: 'b', operation: 'insert', base_version: 0 },
    ])
  })
})

describe('clearSyncedData', () => {
  it('keeps local prompts and returns to the local space', async () => {
    await prepareSignedInUser('user-1')
    const db = await getDb()
    await db.runAsync(
      "INSERT INTO prompts (id, space_id, title, content, created_at, updated_at) VALUES ('local', ?, 't', 'c', 1, 1)",
      LOCAL_SPACE_ID,
    )

    await clearSyncedData()

    expect(await countLocalPrompts()).toBe(1)
    expect(useSpaceStore.getState()).toMatchObject({ currentSpaceId: LOCAL_SPACE_ID, ownerUserId: null })
  })
})
