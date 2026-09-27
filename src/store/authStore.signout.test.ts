// Task 17 fix round 4 — integration test over the REAL token store, authApi and apiClient
// (only fetch, the DB-backed wipe and the sync engine are faked). Proves the token lifecycle
// end-to-end rather than against a mocked authApi: a stalled /auth/logout POST can neither
// delay the local token clear nor, when it finally settles, touch a newer session.
jest.mock('@/lib/deviceIdentity', () => ({
  getDeviceInfo: async () => ({ deviceId: 'dev-1', deviceName: 'Pixel', platform: 'android' }),
}))
jest.mock('@/lib/accountData', () => ({
  clearSyncedData: jest.fn(async () => undefined),
}))
jest.mock('@/lib/syncEngine', () => ({
  runSync: jest.fn(async () => undefined),
  awaitIdle: jest.fn(async () => undefined),
}))
jest.mock('@/lib/socialSignOut', () => ({
  signOutSocialProviders: jest.fn(async () => undefined),
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

import * as SecureStore from 'expo-secure-store'

import { clearSyncedData } from '@/lib/accountData'
import {
  getTokens,
  isSignOutPending,
  onTokensCleared,
  resetTokenCacheForTests,
  setTokens,
} from '@/lib/tokenStore'

import { useAuthStore } from './authStore'

const mockSecure = (SecureStore as unknown as { __store: Map<string, string> }).__store

const sessionA = { accessToken: 'a-access', refreshToken: 'a-refresh', expiresAt: Date.now() + 600_000 }
const sessionB = { accessToken: 'b-access', refreshToken: 'b-refresh', expiresAt: Date.now() + 600_000 }

// fetch that hangs on /auth/logout until released (then answers with `status`).
function hangingLogout(status: number) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const fn = jest.fn(async (url: string) => {
    if (url.endsWith('/auth/logout')) await gate
    const body = status < 300 ? { success: true } : { success: false, errorCode: 'Unauthorized', message: 'x' }
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      text: async () => JSON.stringify(body),
      json: async () => body,
    }
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return { fn, release }
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  mockSecure.clear()
  resetTokenCacheForTests()
  jest.clearAllMocks()
  useAuthStore.setState({ user: null, keepSignedIn: true })
})

afterEach(() => {
  globalThis.fetch = originalFetch
  jest.useRealTimers()
})

describe('signOut() with a stalled /auth/logout (real token store)', () => {
  it('local tokens are gone — in memory AND in SecureStore — once signOut() resolves, while the POST still hangs', async () => {
    jest.useFakeTimers()
    await setTokens(sessionA)
    const { fn, release } = hangingLogout(200)
    useAuthStore.setState({ user: { id: 'a', email: null, username: null, firstName: null, lastName: null, userCode: null } })

    const done = useAuthStore.getState().signOut()
    await jest.advanceTimersByTimeAsync(5000)
    await done

    // The revoke was attempted with A's session, and it is STILL pending.
    expect(fn.mock.calls.filter(([u]) => (u as string).endsWith('/auth/logout'))).toHaveLength(1)
    expect(await getTokens()).toBeNull()
    resetTokenCacheForTests() // read what a cold start would read
    expect(await getTokens()).toBeNull()
    expect(mockSecure.has('aiokin.tokens')).toBe(false)
    expect(await isSignOutPending()).toBe(false)
    expect(clearSyncedData).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()

    release()
  })

  it("A's late-settling revoke never touches B, who signed in meanwhile — success or 401", async () => {
    for (const status of [200, 401]) {
      mockSecure.clear()
      resetTokenCacheForTests()
      jest.useFakeTimers()
      await setTokens(sessionA)
      const { release } = hangingLogout(status)

      const done = useAuthStore.getState().signOut()
      await jest.advanceTimersByTimeAsync(5000)
      await done

      // B signs in while A's /auth/logout is still stalled.
      await setTokens(sessionB)
      const listener = jest.fn()
      const stop = onTokensCleared(listener)

      // A's POST finally settles.
      release()
      await jest.advanceTimersByTimeAsync(0)

      expect(listener).not.toHaveBeenCalled()
      expect(await getTokens()).toEqual(sessionB)
      resetTokenCacheForTests()
      expect(await getTokens()).toEqual(sessionB)
      stop()
      jest.useRealTimers()
    }
  })
})
