// Single source of truth for every route path and its params.
// Paths mirror the files in src/app — route groups like (drawer)/(tabs) don't appear in the URL.
// Adding a screen: create the file in src/app, then add it to ROUTES + RouteParams.

export const ROUTES = {
  // (drawer)/(tabs)
  home: '/',
  search: '/search',
  favorites: '/favorites',
  profile: '/profile',
  // (drawer)
  settings: '/settings',
  // root stack — modal/formSheet screens presented over the drawer
  promptDetail: '/prompt-detail',
  promptEdit: '/prompt-edit',
  vaultSwitcher: '/vault-switcher',
  signup: '/onboarding/signup',
  login: '/onboarding/login',
  verifyEmail: '/onboarding/verify-email',
  forgotPassword: '/onboarding/forgot-password',
  sync: '/onboarding/sync',
} as const

export type RouteName = keyof typeof ROUTES
export type RoutePath = (typeof ROUTES)[RouteName]

// `undefined` = route takes no params. Values must be strings (they end up in the URL).
export type RouteParams = {
  home: undefined
  search: { q?: string }
  favorites: undefined
  profile: undefined
  settings: undefined
  promptDetail: { id: string }
  promptEdit: { id?: string }
  vaultSwitcher: undefined
  welcome: undefined
  signup: undefined
  login: { email?: string }
  verifyEmail: { email: string }
  forgotPassword: { email?: string }
  sync: undefined
}
