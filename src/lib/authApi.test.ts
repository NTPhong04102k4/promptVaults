jest.mock('./deviceIdentity', () => ({
  getDeviceInfo: async () => ({ deviceId: 'dev-1', deviceName: 'Pixel', platform: 'android' }),
}))

import * as SecureStore from 'expo-secure-store'

import { login, logout, register, resetPassword, verifyOtp, verifyPasswordOtp } from './authApi'
import { getTokens, onTokensCleared, resetTokenCacheForTests, setTokens } from './tokenStore'

// expo-secure-store is auto-mocked from __mocks__/expo-secure-store.js (see ruling P16);
// its backing Map is exposed as __store so we can seed/inspect it directly.
const mockSecure = (SecureStore as unknown as { __store: Map<string, string> }).__store

const profile = {
  userID: 'u-1',
  firstName: null,
  lastName: null,
  fullName: null,
  email: 'a@b.com',
  username: 'annguyen',
  image: null,
  socialProvider: null,
  hasPassword: true,
}

function mockFetchOnce(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => JSON.stringify(body),
    json: async () => body,
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

function sentBody(fn: jest.Mock): unknown {
  return JSON.parse((fn.mock.calls[0]![1] as RequestInit).body as string)
}

const originalFetch = globalThis.fetch
beforeEach(() => {
  mockSecure.clear()
  resetTokenCacheForTests()
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('authApi', () => {
  it('register posts username/email/password only', async () => {
    const fn = mockFetchOnce(200, { success: true, message: 'ok' })
    await register({ username: 'annguyen', email: 'a@b.com', password: 'secret1' })
    expect(fn.mock.calls[0]![0]).toMatch(/\/auth\/register$/)
    expect(sentBody(fn)).toEqual({ username: 'annguyen', email: 'a@b.com', password: 'secret1' })
  })

  it('verifyOtp sends device info, stores tokens and returns the user', async () => {
    const fn = mockFetchOnce(201, {
      success: true,
      data: { accessToken: 'a', refreshToken: 'r', expiresIn: 900, tokenType: 'Bearer', user: profile },
    })

    const user = await verifyOtp('a@b.com', '123456')

    expect(sentBody(fn)).toEqual({
      email: 'a@b.com',
      otpCode: '123456',
      deviceId: 'dev-1',
      deviceName: 'Pixel',
      platform: 'android',
    })
    expect(user.username).toBe('annguyen')
    expect((await getTokens())?.accessToken).toBe('a')
  })

  it('login reads the raw snake_case TokenResponse', async () => {
    const fn = mockFetchOnce(200, {
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 900,
      token_type: 'Bearer',
      scope: 'Customer',
    })

    await login('annguyen', 'secret1')

    expect(sentBody(fn)).toEqual({
      usernameOrPhoneOrEmail: 'annguyen',
      password: 'secret1',
      deviceId: 'dev-1',
      deviceName: 'Pixel',
      platform: 'android',
    })
    expect((await getTokens())?.refreshToken).toBe('r')
  })

  it('login surfaces InvalidCredentials as an ApiError code', async () => {
    mockFetchOnce(401, { success: false, errorCode: 'InvalidCredentials', message: 'x' })
    await expect(login('a@b.com', 'wrong1')).rejects.toMatchObject({ code: 'InvalidCredentials' })
  })

  it('verifyPasswordOtp returns the temporary password lifetime', async () => {
    mockFetchOnce(200, { success: true, data: { step: 'temp_password_sent', expiresInMinutes: 3 } })
    await expect(verifyPasswordOtp('a@b.com', '123456')).resolves.toEqual({
      step: 'temp_password_sent',
      expiresInMinutes: 3,
    })
  })

  it('resetPassword sends email, temporaryPassword, newPassword', async () => {
    const fn = mockFetchOnce(200, { success: true })
    await resetPassword('a@b.com', 'Ab12Cd34', 'newpass1')
    expect(sentBody(fn)).toEqual({
      email: 'a@b.com',
      temporaryPassword: 'Ab12Cd34',
      newPassword: 'newpass1',
    })
  })

  it('logout clears tokens even when the server call fails', async () => {
    await setTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 600_000 })
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('offline')) as unknown as typeof fetch

    await logout()

    expect(await getTokens()).toBeNull()
  })

  it('logout does not surface a "session expired" event when the session is already dead', async () => {
    await setTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 600_000 })
    const listener = jest.fn()
    const stop = onTokensCleared(listener)
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: '401',
      json: async () => ({ success: false, errorCode: 'Unauthorized', message: 'x' }),
      text: async () => JSON.stringify({ success: false, errorCode: 'Unauthorized', message: 'x' }),
    }) as unknown as typeof fetch

    await logout()

    expect(await getTokens()).toBeNull()
    expect(listener).not.toHaveBeenCalledWith('expired')
    expect(listener).toHaveBeenCalledWith('signout')
    stop()
  })

  it('logout with an already-expired access token neither refreshes nor fires "expired", even when refresh would fail', async () => {
    await setTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() - 1 })
    const listener = jest.fn()
    const stop = onTokensCleared(listener)
    const fn = jest.fn(async (url: string) => {
      // If logout ever triggers a proactive/on-401 refresh, this would reject it —
      // proving the assertions below actually exercise the no-refresh path.
      if (url.endsWith('/auth/refresh-token')) {
        return {
          ok: false,
          status: 401,
          statusText: '401',
          json: async () => ({ success: false, errorCode: 'InvalidRefreshToken', message: 'x' }),
          text: async () => JSON.stringify({ success: false, errorCode: 'InvalidRefreshToken', message: 'x' }),
        }
      }
      return {
        ok: true,
        status: 200,
        statusText: '200',
        json: async () => ({ success: true }),
        text: async () => JSON.stringify({ success: true }),
      }
    })
    globalThis.fetch = fn as unknown as typeof fetch

    await logout()

    expect(fn.mock.calls.filter(([u]) => (u as string).endsWith('/auth/refresh-token'))).toHaveLength(0)
    expect(listener).not.toHaveBeenCalledWith('expired')
    expect(listener).toHaveBeenCalledWith('signout')
    expect(await getTokens()).toBeNull()
    stop()
  })
})
