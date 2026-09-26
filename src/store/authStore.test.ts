jest.mock('@/lib/authApi', () => ({
  getMe: jest.fn(),
  logout: jest.fn(),
}))
jest.mock('@/lib/accountData', () => ({
  clearSyncedData: jest.fn(),
}))
jest.mock('@/lib/syncEngine', () => ({
  runSync: jest.fn(),
  awaitIdle: jest.fn(),
}))
jest.mock('@/lib/tokenStore', () => ({
  getTokens: jest.fn(),
  onTokensCleared: jest.fn(),
}))

const mockMemory = new Map<string, string>()
jest.mock('@/lib/secureStorage', () => ({
  LargeSecureStore: {
    getItem: jest.fn(async (key: string) => mockMemory.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockMemory.set(key, value)
    }),
    removeItem: jest.fn(async (key: string) => {
      mockMemory.delete(key)
    }),
  },
}))

import { clearSyncedData } from '@/lib/accountData'
import { type AccountProfile, getMe, logout } from '@/lib/authApi'
import { LargeSecureStore } from '@/lib/secureStorage'
import { awaitIdle, runSync } from '@/lib/syncEngine'
import { getTokens, onTokensCleared } from '@/lib/tokenStore'

import { startAuthListener, toAuthUser, useAuthStore } from './authStore'

const profile: AccountProfile = {
  userID: 'user-1',
  firstName: 'An',
  lastName: '',
  fullName: 'An',
  email: 'a@b.com',
  username: 'annguyen',
  image: null,
  socialProvider: null,
  hasPassword: true,
}
const tokens = { accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: 1 }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  useAuthStore.setState({ user: null, hasOnboarded: false, keepSignedIn: true, restoring: true })
  jest.clearAllMocks()
  ;(onTokensCleared as jest.Mock).mockReturnValue(jest.fn())
  ;(awaitIdle as jest.Mock).mockResolvedValue(undefined)
  ;(runSync as jest.Mock).mockResolvedValue({ pushed: 0, conflicts: 0, rejected: 0, pulled: 0, errors: 0 })
  ;(clearSyncedData as jest.Mock).mockResolvedValue(undefined)
})

describe('toAuthUser', () => {
  it('maps the AioKin profile, treating empty strings as null', () => {
    expect(toAuthUser(profile)).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      username: 'annguyen',
      firstName: 'An',
      lastName: null,
      userCode: null,
    })
  })

  it('returns null without a profile', () => {
    expect(toAuthUser(null)).toBeNull()
  })
})

describe('useAuthStore persistence', () => {
  it('persists user and flags but never tokens', async () => {
    useAuthStore.getState().setUser(profile)
    useAuthStore.getState().completeOnboarding()
    await Promise.resolve()

    const stored = mockMemory.get('auth-store')
    expect(JSON.parse(stored!).state).toEqual({
      user: toAuthUser(profile),
      hasOnboarded: true,
      keepSignedIn: true,
    })
    expect(stored).not.toContain('secret')
  })

  it('marks itself hydrated after rehydrating', async () => {
    await useAuthStore.persist.rehydrate()
    expect(useAuthStore.getState().hydrated).toBe(true)
  })
})

describe('auth actions', () => {
  it('signOut logs out on the server and clears the user', async () => {
    useAuthStore.getState().setUser(profile)
    await useAuthStore.getState().signOut()
    expect(logout).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })

  // Task 17 fix round 1 (issue 1): signOut() is the ONE sign-out seam — it must be the place
  // that waits for any in-flight sync and wipes synced data, not a parallel call site.
  it('signOut waits for any in-flight sync, then wipes synced data, in that order', async () => {
    const order: string[] = []
    ;(logout as jest.Mock).mockImplementation(async () => {
      order.push('logout')
    })
    ;(awaitIdle as jest.Mock).mockImplementation(async () => {
      order.push('awaitIdle')
    })
    ;(clearSyncedData as jest.Mock).mockImplementation(async () => {
      order.push('clearSyncedData')
    })
    useAuthStore.getState().setUser(profile)

    await useAuthStore.getState().signOut()

    expect(order).toEqual(['logout', 'awaitIdle', 'clearSyncedData'])
    expect(useAuthStore.getState().user).toBeNull()
  })

  // Task 17 fix round 3 (issue 1): apiClient has no request timeout, so logout()'s POST could
  // hang forever on a stalled network. Every awaited step in signOut() needs a ceiling, not
  // just the sync flush from round 2 — otherwise the app is stuck on the splash screen with
  // no data leak but also no way out.
  it('bounds a never-resolving logout() so sign-out still completes', async () => {
    jest.useFakeTimers()
    try {
      ;(logout as jest.Mock).mockReturnValueOnce(new Promise(() => undefined)) // never settles
      useAuthStore.getState().setUser(profile)

      const done = useAuthStore.getState().signOut()
      await jest.advanceTimersByTimeAsync(5000)
      await done

      expect(awaitIdle).toHaveBeenCalled()
      expect(clearSyncedData).toHaveBeenCalled()
      expect(useAuthStore.getState().user).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('startAuthListener loads /account/me when tokens exist', async () => {
    ;(getTokens as jest.Mock).mockResolvedValue(tokens)
    ;(getMe as jest.Mock).mockResolvedValue(profile)
    await useAuthStore.persist.rehydrate()

    startAuthListener()
    await flush()

    expect(useAuthStore.getState().user?.id).toBe('user-1')
  })

  it('startAuthListener keeps the persisted user when offline', async () => {
    useAuthStore.setState({ user: toAuthUser(profile) })
    ;(getTokens as jest.Mock).mockResolvedValue(tokens)
    ;(getMe as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { code: 'network' }))
    await useAuthStore.persist.rehydrate()

    startAuthListener()
    await flush()

    expect(useAuthStore.getState().user?.id).toBe('user-1')
  })

  it('startAuthListener clears the user when there are no tokens', async () => {
    useAuthStore.setState({ user: toAuthUser(profile) })
    ;(getTokens as jest.Mock).mockResolvedValue(null)
    await useAuthStore.persist.rehydrate()

    startAuthListener()
    await flush()

    expect(useAuthStore.getState().user).toBeNull()
  })

  it('drops the session on cold start when "keep me signed in" was off', async () => {
    ;(getTokens as jest.Mock).mockResolvedValue(tokens)
    useAuthStore.setState({ user: toAuthUser(profile), keepSignedIn: false })
    await Promise.resolve()
    await useAuthStore.persist.rehydrate()

    startAuthListener()
    await flush()

    expect(logout).toHaveBeenCalled()
    expect(getMe).not.toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })

  // Task 17 fix round 1 (issue 1): the cold-start sign-out now also wipes synced data (it
  // goes through the same signOut() seam), so it gets one best-effort flush attempt first,
  // while tokens are still valid.
  it('flushes pending changes best-effort before the cold-start sign-out wipes data', async () => {
    ;(getTokens as jest.Mock).mockResolvedValue(tokens)
    useAuthStore.setState({ user: toAuthUser(profile), keepSignedIn: false })
    await Promise.resolve()
    await useAuthStore.persist.rehydrate()

    startAuthListener()
    await flush()

    expect(runSync).toHaveBeenCalled()
    expect(logout).toHaveBeenCalled()
    expect(clearSyncedData).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('does not let a failed flush block the cold-start sign-out', async () => {
    ;(getTokens as jest.Mock).mockResolvedValue(tokens)
    ;(runSync as jest.Mock).mockRejectedValue(new Error('offline'))
    useAuthStore.setState({ user: toAuthUser(profile), keepSignedIn: false })
    await Promise.resolve()
    await useAuthStore.persist.rehydrate()

    startAuthListener()
    await flush()

    expect(logout).toHaveBeenCalled()
    expect(clearSyncedData).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })

  // Task 17 fix round 2 (issue 1): a stalled flush must not widen the window where the UI
  // renders while the previous account's data is still live — `restoring` gates that in
  // _layout.tsx — and signOut() must still complete (the wipe is not conditional on the
  // flush finishing).
  describe('restoring (gates _layout.tsx rendering during a cold-start sign-out)', () => {
    it('clears immediately for a guest cold start (no tokens) — nothing to hide', async () => {
      ;(getTokens as jest.Mock).mockResolvedValue(null)
      await useAuthStore.persist.rehydrate()

      startAuthListener()
      await flush()

      expect(useAuthStore.getState().restoring).toBe(false)
    })

    it('clears immediately for the normal "stay signed in" path, without waiting for refreshUser', async () => {
      ;(getTokens as jest.Mock).mockResolvedValue(tokens)
      let resolveGetMe!: (profile: AccountProfile) => void
      ;(getMe as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolveGetMe = resolve
        }),
      )
      await useAuthStore.persist.rehydrate()

      startAuthListener()
      await flush()

      // refreshUser() is still pending, but restoring must already be false — the normal
      // launch path was never meant to wait on this network call.
      expect(useAuthStore.getState().restoring).toBe(false)
      resolveGetMe(profile)
    })

    it('stays true through the cold-start flush and sign-out, then clears', async () => {
      let resolveClear!: () => void
      ;(clearSyncedData as jest.Mock).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveClear = resolve
          }),
      )
      ;(getTokens as jest.Mock).mockResolvedValue(tokens)
      useAuthStore.setState({ user: toAuthUser(profile), keepSignedIn: false })
      await Promise.resolve()
      await useAuthStore.persist.rehydrate()

      startAuthListener()
      await flush()

      expect(useAuthStore.getState().restoring).toBe(true)

      resolveClear()
      await flush()

      expect(useAuthStore.getState().restoring).toBe(false)
    })

    // The exact regression from the round-1 review: apiClient has no request timeout, so an
    // unbounded flush could hang cold start indefinitely on a stalled network. The flush must
    // give up on its own, and signOut() must complete (wipe the previous account) regardless.
    it('bounds a never-resolving flush so the cold-start sign-out still completes', async () => {
      jest.useFakeTimers()
      try {
        ;(getTokens as jest.Mock).mockResolvedValue(tokens)
        ;(runSync as jest.Mock).mockReturnValueOnce(new Promise(() => undefined)) // never settles
        useAuthStore.setState({ user: toAuthUser(profile), keepSignedIn: false })
        await Promise.resolve()
        await useAuthStore.persist.rehydrate()

        startAuthListener()
        await jest.advanceTimersByTimeAsync(5000)

        expect(logout).toHaveBeenCalled()
        expect(clearSyncedData).toHaveBeenCalled()
        expect(useAuthStore.getState().user).toBeNull()
        expect(useAuthStore.getState().restoring).toBe(false)
      } finally {
        jest.useRealTimers()
      }
    })
  })

  // Task 17 fix round 3 (issue 2): before this task's fixes, a failure here still rendered
  // the app (restoring didn't exist yet). Now that rendering is gated on restoreSession()
  // finishing, any step that throws or hangs BEFORE reaching a branch that clears `restoring`
  // must not lock the splash screen forever on every future launch.
  describe('restoreSession never gets stuck, even on failure (fix round 3, issue 2)', () => {
    it('clears restoring even when getTokens() throws (e.g. a SecureStore/keystore fault)', async () => {
      ;(getTokens as jest.Mock).mockRejectedValue(new Error('keystore fault'))
      await useAuthStore.persist.rehydrate()

      startAuthListener()
      await flush()

      expect(useAuthStore.getState().restoring).toBe(false)
    })

    // Confirmed against the installed zustand version (src/store/authStore.ts comment): on a
    // FAILED rehydrate, onRehydrateStorage's returned callback still runs (setting `hydrated:
    // true` below) but onFinishHydration listeners never fire — awaiting that event, as the
    // pre-fix code did, would hang restoreSession() (and therefore `restoring`) forever.
    it('does not hang waiting on hydration when the persisted read fails', async () => {
      useAuthStore.setState({ hydrated: false })
      ;(LargeSecureStore.getItem as jest.Mock).mockRejectedValueOnce(new Error('keystore fault'))
      ;(getTokens as jest.Mock).mockResolvedValue(null)

      // restoreSession() starts waiting on `hydrated` (still false) right here.
      startAuthListener()
      // This attempt fails, but its postRehydrationCallback still fires and sets `hydrated`.
      await useAuthStore.persist.rehydrate()
      await flush()

      expect(useAuthStore.getState().hydrated).toBe(true)
      expect(useAuthStore.getState().restoring).toBe(false)
    })
  })

  it('clears the user when tokens are cleared elsewhere (expired refresh)', () => {
    let listener: (reason: string) => void = () => undefined
    ;(onTokensCleared as jest.Mock).mockImplementation((fn) => {
      listener = fn
      return jest.fn()
    })
    ;(getTokens as jest.Mock).mockResolvedValue(null)
    useAuthStore.setState({ user: toAuthUser(profile) })

    startAuthListener()
    listener('expired')

    expect(useAuthStore.getState().user).toBeNull()
  })
})
