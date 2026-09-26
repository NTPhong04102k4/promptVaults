jest.mock('./syncPush', () => ({ pushSpace: jest.fn() }))
jest.mock('./syncPull', () => ({ pullSpace: jest.fn() }))
jest.mock('./spaces', () => ({ fetchAndStoreMySpaces: jest.fn(async () => []) }))
jest.mock('./tokenStore', () => ({ getTokens: jest.fn() }))
jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })) }))
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
  return { ApiError }
})

import { ApiError } from '@/services/apiClient'

import { getDb } from './db'
import { fetchAndStoreMySpaces } from './spaces'
import { awaitIdle, runSync } from './syncEngine'
import { pullSpace } from './syncPull'
import { pushSpace } from './syncPush'
import { getTokens } from './tokenStore'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const idle = { applied: 0, conflicts: 0, rejected: 0, remaining: false }

beforeEach(async () => {
  jest.clearAllMocks()
  const db = await getDb()
  await db.execAsync("DELETE FROM spaces WHERE kind <> 'local'")
  await db.execAsync(
    "INSERT INTO spaces (id, kind, name, can_manage, created_at) VALUES ('s1', 'personal', 'P', 1, 1), ('s2', 'team', 'T', 0, 2)",
  )
  ;(getTokens as jest.Mock).mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresAt: 1 })
  ;(pushSpace as jest.Mock).mockResolvedValue(idle)
  ;(pullSpace as jest.Mock).mockResolvedValue({ applied: 1, snapshot: false })
})

describe('runSync', () => {
  it('pushes then pulls every synced space, never the local one', async () => {
    const summary = await runSync()
    expect((pushSpace as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['s1', 's2'])
    expect((pullSpace as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['s1', 's2'])
    expect(summary).toEqual({ pushed: 0, conflicts: 0, rejected: 0, pulled: 2, errors: 0 })
  })

  it('keeps pushing while the outbox has more rows, sharing one skip set per space', async () => {
    ;(pushSpace as jest.Mock)
      .mockResolvedValueOnce({ applied: 49, conflicts: 0, rejected: 1, remaining: true })
      .mockResolvedValueOnce({ applied: 3, conflicts: 1, rejected: 0, remaining: false })
    const summary = await runSync()
    expect(summary).toMatchObject({ pushed: 52, conflicts: 1, rejected: 1 })
    const [first, second] = (pushSpace as jest.Mock).mock.calls
    expect(first![1].skipSeqs).toBe(second![1].skipSeqs)
  })

  it('refreshes the space list once when a space answers 403', async () => {
    ;(pullSpace as jest.Mock).mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'Ban khong thuoc space nay.'))
    const summary = await runSync()
    expect(summary.errors).toBe(1)
    expect(fetchAndStoreMySpaces).toHaveBeenCalledTimes(1)
  })

  it('is single-flight', async () => {
    await Promise.all([runSync(), runSync(), runSync()])
    expect(pullSpace).toHaveBeenCalledTimes(2)
  })

  it('does nothing when signed out', async () => {
    ;(getTokens as jest.Mock).mockResolvedValue(null)
    await runSync()
    expect(pushSpace).not.toHaveBeenCalled()
  })

  it('an error in one space does not stop the others', async () => {
    ;(pushSpace as jest.Mock).mockRejectedValueOnce(new Error('offline'))
    const summary = await runSync()
    expect(summary.errors).toBe(1)
    expect(pullSpace).toHaveBeenCalledWith('s2')
  })
})

// Task 17 fix round 1 (issue 3): the sign-out path awaits this so a pull already in flight
// can't finish writing a wiped account's data back to disk after clearSyncedData() runs.
describe('awaitIdle', () => {
  it('resolves immediately when nothing is running', async () => {
    await expect(awaitIdle()).resolves.toBeUndefined()
  })

  it('waits for an in-flight run to settle before resolving', async () => {
    let resolvePull!: (value: { applied: number; snapshot: boolean }) => void
    ;(pullSpace as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve
        }),
    )

    const sync = runSync()
    let settled = false
    const idlePromise = awaitIdle().then(() => {
      settled = true
    })

    await flush()
    expect(settled).toBe(false)

    resolvePull({ applied: 0, snapshot: false })
    await sync
    await idlePromise
    expect(settled).toBe(true)
  })

  it('never rejects even when the awaited run fails outright', async () => {
    ;(getTokens as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const sync = runSync().catch(() => undefined)
    await expect(awaitIdle()).resolves.toBeUndefined()
    await sync
  })
})
