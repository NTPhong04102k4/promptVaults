import * as SecureStore from 'expo-secure-store'

import {
  clearTokens,
  clearTokensIfCurrent,
  getTokens,
  isSignOutPending,
  normalizeTokens,
  onTokensCleared,
  replaceTokensIfCurrent,
  resetTokenCacheForTests,
  setSignOutPending,
  setTokens,
} from './tokenStore'

// expo-secure-store is auto-mocked from __mocks__/expo-secure-store.js (see ruling P16);
// its backing Map is exposed as __store so we can seed/inspect it directly.
const mockSecure = (SecureStore as unknown as { __store: Map<string, string> }).__store

beforeEach(() => {
  mockSecure.clear()
  resetTokenCacheForTests()
})

describe('normalizeTokens', () => {
  it('accepts the snake_case TokenResponse of /auth/login', () => {
    expect(
      normalizeTokens({ access_token: 'a', refresh_token: 'r', expires_in: 60 }, 1_000),
    ).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 61_000 })
  })

  it('accepts the camelCase data of /auth/verify-otp', () => {
    expect(normalizeTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 60 }, 0)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 60_000,
    })
  })

  it('rejects a response without both tokens', () => {
    expect(() => normalizeTokens({ access_token: 'a' })).toThrow('invalid_token_response')
  })
})

describe('token persistence', () => {
  it('round-trips through SecureStore', async () => {
    await setTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: 5 })
    resetTokenCacheForTests()
    expect(await getTokens()).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 5 })
  })

  it('clearTokens removes them and notifies listeners with the reason', async () => {
    const listener = jest.fn()
    const stop = onTokensCleared(listener)
    await setTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: 5 })

    await clearTokens('expired')

    expect(await getTokens()).toBeNull()
    expect(mockSecure.size).toBe(0)
    expect(listener).toHaveBeenCalledWith('expired')
    stop()
  })

  it('treats a corrupt stored value as signed out', async () => {
    mockSecure.set('aiokin.tokens', '{not json')
    expect(await getTokens()).toBeNull()
  })
})

// Task 17 fix round 4: a network call that settles LATE (after a sign-out, possibly after a
// different account signed in) must only ever touch the exact session it started from.
describe('compare-and-set writes for late-settling callers', () => {
  const sessionA = { accessToken: 'a-access', refreshToken: 'a-refresh', expiresAt: 5 }
  const sessionB = { accessToken: 'b-access', refreshToken: 'b-refresh', expiresAt: 5 }

  it('clearTokensIfCurrent clears (and notifies) when the stored session is still the expected one', async () => {
    const listener = jest.fn()
    const stop = onTokensCleared(listener)
    await setTokens(sessionA)

    await expect(clearTokensIfCurrent(sessionA, 'expired')).resolves.toBe(true)

    expect(await getTokens()).toBeNull()
    expect(mockSecure.has('aiokin.tokens')).toBe(false)
    expect(listener).toHaveBeenCalledWith('expired')
    stop()
  })

  it('clearTokensIfCurrent never touches a newer session', async () => {
    const listener = jest.fn()
    const stop = onTokensCleared(listener)
    await setTokens(sessionB)

    await expect(clearTokensIfCurrent(sessionA, 'expired')).resolves.toBe(false)

    expect(await getTokens()).toEqual(sessionB)
    expect(listener).not.toHaveBeenCalled()
    stop()
  })

  it('clearTokensIfCurrent is a silent no-op once already signed out', async () => {
    const listener = jest.fn()
    const stop = onTokensCleared(listener)

    await expect(clearTokensIfCurrent(sessionA, 'expired')).resolves.toBe(false)

    expect(listener).not.toHaveBeenCalled()
    stop()
  })

  it('replaceTokensIfCurrent rotates the expected session', async () => {
    await setTokens(sessionA)
    const rotated = { ...sessionA, accessToken: 'a2', refreshToken: 'a2-refresh' }

    await expect(replaceTokensIfCurrent(sessionA, rotated)).resolves.toBe(true)

    resetTokenCacheForTests()
    expect(await getTokens()).toEqual(rotated)
  })

  it('replaceTokensIfCurrent never resurrects a signed-out session', async () => {
    await setTokens(sessionA)
    await clearTokens('signout')

    await expect(replaceTokensIfCurrent(sessionA, { ...sessionA, refreshToken: 'a2' })).resolves.toBe(false)

    resetTokenCacheForTests()
    expect(await getTokens()).toBeNull()
  })

  it('replaceTokensIfCurrent never overwrites a newer session', async () => {
    await setTokens(sessionB)

    await expect(replaceTokensIfCurrent(sessionA, { ...sessionA, refreshToken: 'a2' })).resolves.toBe(false)

    resetTokenCacheForTests()
    expect(await getTokens()).toEqual(sessionB)
  })
})

describe('sign-out-pending marker (crash-safe sign-out)', () => {
  it('round-trips through SecureStore', async () => {
    expect(await isSignOutPending()).toBe(false)
    await setSignOutPending(true)
    expect(await isSignOutPending()).toBe(true)
    await setSignOutPending(false)
    expect(await isSignOutPending()).toBe(false)
  })

  it('never throws — a keystore fault reads as "not pending" and a failed write is swallowed', async () => {
    const getSpy = jest.spyOn(SecureStore, 'getItemAsync').mockRejectedValueOnce(new Error('keystore'))
    const setSpy = jest.spyOn(SecureStore, 'setItemAsync').mockRejectedValueOnce(new Error('keystore'))

    await expect(isSignOutPending()).resolves.toBe(false)
    await expect(setSignOutPending(true)).resolves.toBeUndefined()

    getSpy.mockRestore()
    setSpy.mockRestore()
  })
})
