jest.mock('expo-router', () => ({
  router: {
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(),
    canDismiss: jest.fn(),
    dismissAll: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
}))

import { router } from 'expo-router'

import { goBack, push, resetTo, toHref } from './navigate'

beforeEach(() => jest.clearAllMocks())

describe('toHref', () => {
  it('returns the bare path for routes without params', () => {
    expect(toHref('settings')).toBe('/settings')
  })

  it('returns a pathname + params object when params are given', () => {
    expect(toHref('verifyEmail', { email: 'a@b.com' })).toEqual({
      pathname: '/onboarding/verify-email',
      params: { email: 'a@b.com' },
    })
  })
})

describe('navigation helpers', () => {
  it('push forwards the typed href to the router', () => {
    push('search', { q: 'email' })
    expect(router.push).toHaveBeenCalledWith({ pathname: '/search', params: { q: 'email' } })
  })

  it('goBack falls back to a route when there is no history', () => {
    ;(router.canGoBack as jest.Mock).mockReturnValue(false)
    goBack('profile')
    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith('/profile')
  })

  it('resetTo dismisses the stack before replacing', () => {
    ;(router.canDismiss as jest.Mock).mockReturnValue(true)
    resetTo('home')
    expect(router.dismissAll).toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith('/')
  })
})
