jest.mock('@/lib/authApi', () => ({
  getMe: jest.fn(),
  logout: jest.fn(),
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

import { type AccountProfile, getMe, logout } from '@/lib/authApi'
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
  useAuthStore.setState({ user: null, hasOnboarded: false, keepSignedIn: true })
  jest.clearAllMocks()
  ;(onTokensCleared as jest.Mock).mockReturnValue(jest.fn())
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
