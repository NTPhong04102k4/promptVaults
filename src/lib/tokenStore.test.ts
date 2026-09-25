import * as SecureStore from 'expo-secure-store'

import {
  clearTokens,
  getTokens,
  normalizeTokens,
  onTokensCleared,
  resetTokenCacheForTests,
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
