import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { StyleSheet, useColorScheme } from 'react-native'

import { getThemePreference, setThemePreference as persistThemePreference } from '@/lib/themePreference'

import { type ColorScheme, darkColors, lightColors, stateLayerOpacity } from './colors'
import { elevation, shape, spacing } from './dimensions'
import { resolveScheme, type ThemePreference } from './resolveScheme'
import { typography } from './typography'

export type Theme = {
  dark: boolean
  colors: ColorScheme
  typography: typeof typography
  shape: typeof shape
  spacing: typeof spacing
  elevation: typeof elevation
  stateLayerOpacity: typeof stateLayerOpacity
}

const base = { typography, shape, spacing, elevation, stateLayerOpacity }

export const lightTheme: Theme = { ...base, dark: false, colors: lightColors }
export const darkTheme: Theme = { ...base, dark: true, colors: darkColors }

type ThemeContextValue = {
  colorScheme: 'light' | 'dark'
  preference: ThemePreference
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// Mount once at the app root. Loads the persisted light/dark/system preference so `useTheme()`
// everywhere else can respect it instead of only following the OS appearance.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')

  useEffect(() => {
    getThemePreference()
      .then(setPreferenceState)
      .catch(() => setPreferenceState('system'))
  }, [])

  function setPreference(next: ThemePreference) {
    setPreferenceState(next)
    persistThemePreference(next).catch(() => {})
  }

  const colorScheme = resolveScheme(preference, systemScheme === 'unspecified' ? undefined : systemScheme)

  return (
    <ThemeContext.Provider value={{ colorScheme, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

// Respects a `<ThemeProvider>` preference override when one is mounted; otherwise falls back to
// the OS appearance directly (app.json: userInterfaceStyle = automatic), so components still
// work in isolation (tests, Storybook-style previews) without a provider.
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext)
  const systemScheme = useColorScheme()
  const colorScheme = ctx ? ctx.colorScheme : systemScheme === 'dark' ? 'dark' : 'light'
  return colorScheme === 'dark' ? darkTheme : lightTheme
}

// For a settings screen to build a light/dark/system toggle. Requires a `<ThemeProvider>` ancestor.
export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemePreference must be used within a ThemeProvider')
  return ctx
}

// Theme-aware StyleSheet: const useStyles = makeStyles((t) => ({ ... })); then useStyles() in a component.
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T) {
  // Only two themes exist, so each factory builds its sheet at most twice.
  const cache = new Map<Theme, T>()
  return function useStyles(): T {
    const theme = useTheme()
    let styles = cache.get(theme)
    if (!styles) {
      styles = StyleSheet.create(factory(theme))
      cache.set(theme, styles)
    }
    return styles
  }
}

export { darkColors, lightColors, seedColor, stateLayerOpacity } from './colors'
export type { ColorRole, ColorScheme } from './colors'
export { elevation, shape, spacing } from './dimensions'
export type { ThemePreference } from './resolveScheme'
export { fontAssets, fontFamily, text, typography } from './typography'
export type { FontWeight, TypographyRole } from './typography'
