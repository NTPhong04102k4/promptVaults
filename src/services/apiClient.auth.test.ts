jest.mock('@/lib/deviceIdentity', () => ({
  getDeviceInfo: async () => ({ deviceId: 'dev-1', deviceName: 'Pixel', platform: 'android' }),
}))

import * as SecureStore from 'expo-secure-store'

import {
  clearTokens,
  getTokens,
  onTokensCleared,
  resetTokenCacheForTests,
  setTokens,
} from '@/lib/tokenStore'

import { apiClient } from './apiClient'

// expo-secure-store is auto-mocked from __mocks__/expo-secure-store.js (see ruling P16);
// its backing Map is exposed as __store so we can seed/inspect it directly.
const mockSecure = (SecureStore as unknown as { __store: Map<string, string> }).__store

type Handler = (url: string, init: RequestInit) => { status: number; body?: unknown }

function mockFetch(handler: Handler) {
  const fn = jest.fn(async (url: string, init: RequestInit) => {
    const { status, body } = handler(url, init)
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
      json: async () => body,
    }
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

function authHeader(init: RequestInit): string | undefined {
  return (init.headers as Record<string, string>).Authorization
}

const originalFetch = globalThis.fetch

beforeEach(async () => {
  mockSecure.clear()
  resetTokenCacheForTests()
  await setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: Date.now() + 600_000 })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('apiClient auth', () => {
  it('attaches the bearer token', async () => {
    const fetchMock = mockFetch(() => ({ status: 200, body: { success: true, data: 1 } }))
    await apiClient.get('/account/me', { auth: true })
    expect(authHeader(fetchMock.mock.calls[0]![1])).toBe('Bearer old-access')
  })

  it('rejects with not_signed_in when there are no tokens', async () => {
    mockSecure.clear()
    resetTokenCacheForTests()
    mockFetch(() => ({ status: 200 }))
    await expect(apiClient.get('/account/me', { auth: true })).rejects.toMatchObject({
      status: 401,
      code: 'not_signed_in',
    })
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh-token')) {
        expect(JSON.parse(init.body as string)).toEqual({
          refreshToken: 'old-refresh',
          deviceId: 'dev-1',
          deviceName: 'Pixel',
          platform: 'android',
        })
        return { status: 200, body: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 900 } }
      }
      return authHeader(init) === 'Bearer new-access'
        ? { status: 200, body: { success: true, data: 'ok' } }
        : { status: 401, body: { success: false, errorCode: 'Unauthorized', message: 'x' } }
    })

    await expect(apiClient.get('/account/me', { auth: true })).resolves.toBe('ok')
    expect(fetchMock.mock.calls.filter(([u]) => u.endsWith('/auth/refresh-token'))).toHaveLength(1)
    expect((await getTokens())?.refreshToken).toBe('new-refresh')
  })

  it('shares one refresh between concurrent 401s (refresh tokens rotate)', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh-token')) {
        return { status: 200, body: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 900 } }
      }
      return authHeader(init) === 'Bearer new-access'
        ? { status: 200, body: { success: true, data: url } }
        : { status: 401, body: { success: false, errorCode: 'Unauthorized', message: 'x' } }
    })

    await Promise.all([
      apiClient.get('/a', { auth: true }),
      apiClient.get('/b', { auth: true }),
      apiClient.get('/c', { auth: true }),
    ])

    expect(fetchMock.mock.calls.filter(([u]) => u.endsWith('/auth/refresh-token'))).toHaveLength(1)
  })

  it('clears tokens with reason "expired" when the refresh token is rejected', async () => {
    const listener = jest.fn()
    const stop = onTokensCleared(listener)
    mockFetch((url) =>
      url.endsWith('/auth/refresh-token')
        ? { status: 401, body: { success: false, errorCode: 'InvalidRefreshToken', message: 'x' } }
        : { status: 401, body: { success: false, errorCode: 'Unauthorized', message: 'x' } },
    )

    await expect(apiClient.get('/account/me', { auth: true })).rejects.toMatchObject({
      code: 'session_expired',
    })
    expect(listener).toHaveBeenCalledWith('expired')
    expect(await getTokens()).toBeNull()
    stop()
  })

  it('keeps tokens when the refresh fails because the device is offline', async () => {
    globalThis.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh-token')) throw new TypeError('Network request failed')
      return { ok: false, status: 401, statusText: '401', json: async () => ({}), text: async () => '' }
    }) as unknown as typeof fetch

    await expect(apiClient.get('/account/me', { auth: true })).rejects.toMatchObject({ code: 'network' })
    expect((await getTokens())?.refreshToken).toBe('old-refresh')
  })

  it('refreshes first when the stored access token is already expired', async () => {
    await setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: Date.now() - 1 })
    const fetchMock = mockFetch((url) =>
      url.endsWith('/auth/refresh-token')
        ? { status: 200, body: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 900 } }
        : { status: 200, body: { success: true, data: 1 } },
    )

    await apiClient.get('/account/me', { auth: true })

    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/auth\/refresh-token$/)
    expect(authHeader(fetchMock.mock.calls[1]![1])).toBe('Bearer new-access')
  })

  // Task 17 fix round 4: a refresh POST that stalls past a sign-out (e.g. inside a sync that
  // signOut() gave up waiting on) must not resurrect the signed-out session, nor clear a newer
  // one, when it finally settles.
  describe('a refresh that settles after the session changed', () => {
    function deferredRefresh(response: { status: number; body: unknown }) {
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const fn = jest.fn(async (url: string) => {
        if (url.endsWith('/auth/refresh-token')) await gate
        const { status, body } = url.endsWith('/auth/refresh-token')
          ? response
          : { status: 200, body: { success: true, data: 1 } }
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
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

    it('does not resurrect tokens that were cleared by a sign-out mid-refresh', async () => {
      await setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: Date.now() - 1 })
      const { release } = deferredRefresh({
        status: 200,
        body: { access_token: 'late-access', refresh_token: 'late-refresh', expires_in: 900 },
      })

      const pending = apiClient.get('/account/me', { auth: true })
      await tick()
      await clearTokens('signout')
      release()

      await expect(pending).rejects.toMatchObject({ code: 'session_expired' })
      resetTokenCacheForTests()
      expect(await getTokens()).toBeNull()
    })

    it('does not overwrite a different account that signed in mid-refresh', async () => {
      await setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: Date.now() - 1 })
      const { release } = deferredRefresh({
        status: 200,
        body: { access_token: 'late-access', refresh_token: 'late-refresh', expires_in: 900 },
      })
      const sessionB = { accessToken: 'b-access', refreshToken: 'b-refresh', expiresAt: Date.now() + 600_000 }

      const pending = apiClient.get('/account/me', { auth: true }).catch(() => undefined)
      await tick()
      await clearTokens('signout')
      await setTokens(sessionB)
      release()
      await pending

      resetTokenCacheForTests()
      expect(await getTokens()).toEqual(sessionB)
    })

    it('does not clear (or fire "expired" for) a different account when the stale refresh is rejected', async () => {
      await setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: Date.now() - 1 })
      const { release } = deferredRefresh({
        status: 401,
        body: { success: false, errorCode: 'InvalidRefreshToken', message: 'x' },
      })
      const sessionB = { accessToken: 'b-access', refreshToken: 'b-refresh', expiresAt: Date.now() + 600_000 }

      const pending = apiClient.get('/account/me', { auth: true }).catch(() => undefined)
      await tick()
      await clearTokens('signout')
      await setTokens(sessionB)
      const listener = jest.fn()
      const stop = onTokensCleared(listener)
      release()
      await pending

      expect(listener).not.toHaveBeenCalled()
      expect(await getTokens()).toEqual(sessionB)
      stop()
    })
  })

  it('skipAuthRefresh: rejects the 401 as-is without refreshing, clearing tokens, or firing the cleared event', async () => {
    const listener = jest.fn()
    const stop = onTokensCleared(listener)
    const fetchMock = mockFetch(() => ({
      status: 401,
      body: { success: false, errorCode: 'Unauthorized', message: 'x' },
    }))

    await expect(
      apiClient.post('/auth/logout', { refreshToken: 'old-refresh' }, { auth: true, skipAuthRefresh: true }),
    ).rejects.toMatchObject({ status: 401, code: 'Unauthorized' })

    expect(fetchMock.mock.calls.filter(([u]) => u.endsWith('/auth/refresh-token'))).toHaveLength(0)
    expect(listener).not.toHaveBeenCalled()
    expect((await getTokens())?.refreshToken).toBe('old-refresh')
    stop()
  })

  it('skipAuthRefresh: still succeeds normally when the response is not a 401', async () => {
    const fetchMock = mockFetch(() => ({ status: 200, body: { success: true, data: 'ok' } }))
    await expect(
      apiClient.post('/auth/logout', { refreshToken: 'old-refresh' }, { auth: true, skipAuthRefresh: true }),
    ).resolves.toBe('ok')
    expect(authHeader(fetchMock.mock.calls[0]![1])).toBe('Bearer old-access')
  })

  it('skipAuthRefresh: sends the stored access token as-is with no proactive refresh, even when already expired', async () => {
    await setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: Date.now() - 1 })
    const fetchMock = mockFetch(() => ({ status: 200, body: { success: true, data: 'ok' } }))

    await expect(
      apiClient.post('/auth/logout', { refreshToken: 'old-refresh' }, { auth: true, skipAuthRefresh: true }),
    ).resolves.toBe('ok')

    expect(fetchMock.mock.calls).toHaveLength(1)
    expect(fetchMock.mock.calls.filter(([u]) => u.endsWith('/auth/refresh-token'))).toHaveLength(0)
    expect(authHeader(fetchMock.mock.calls[0]![1])).toBe('Bearer old-access')
  })
})
