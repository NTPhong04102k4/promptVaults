jest.mock('@/lib/auth', () => ({
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(),
  signOut: jest.fn(),
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

import type { Session } from '@supabase/supabase-js'

import { getSession, onAuthStateChange, signOut } from '@/lib/auth'

import { startAuthListener, toAuthUser, useAuthStore } from './authStore'

const session = {
  access_token: 'access-secret',
  refresh_token: 'refresh-secret',
  user: {
    id: 'user-1',
    email: 'a@b.com',
    user_metadata: { username: 'annguyen', first_name: 'An', last_name: '' },
  },
} as unknown as Session

beforeEach(() => {
  useAuthStore.setState({ user: null, hasOnboarded: false, keepSignedIn: true })
  jest.clearAllMocks()
})

describe('toAuthUser', () => {
  it('maps session metadata to a user, treating empty strings as null', () => {
    expect(toAuthUser(session)).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      username: 'annguyen',
      firstName: 'An',
      lastName: null,
    })
  })

  it('returns null without a session', () => {
    expect(toAuthUser(null)).toBeNull()
  })
})

describe('useAuthStore persistence', () => {
  it('persists user and flags but never tokens', async () => {
    useAuthStore.getState().setSession(session)
    useAuthStore.getState().completeOnboarding()
    await Promise.resolve()

    const stored = mockMemory.get('auth-store')
    expect(stored).toBeDefined()
    const persisted = JSON.parse(stored!).state
    expect(persisted).toEqual({
      user: toAuthUser(session),
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
  it('signOut clears the user after Supabase signs out', async () => {
    useAuthStore.getState().setSession(session)
    await useAuthStore.getState().signOut()
    expect(signOut).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('startAuthListener loads the current session and subscribes to changes', async () => {
    const unsubscribe = jest.fn()
    ;(getSession as jest.Mock).mockResolvedValue(session)
    ;(onAuthStateChange as jest.Mock).mockReturnValue(unsubscribe)

    await useAuthStore.persist.rehydrate()
    const stop = startAuthListener()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useAuthStore.getState().user?.id).toBe('user-1')
    expect(stop).toBe(unsubscribe)
  })

  it('startAuthListener drops the session when "keep me signed in" was off', async () => {
    ;(getSession as jest.Mock).mockResolvedValue(session)
    ;(onAuthStateChange as jest.Mock).mockReturnValue(jest.fn())
    useAuthStore.setState({ user: toAuthUser(session), keepSignedIn: false })
    await Promise.resolve()
    await useAuthStore.persist.rehydrate()

    startAuthListener()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(signOut).toHaveBeenCalled()
    expect(getSession).not.toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })
})
