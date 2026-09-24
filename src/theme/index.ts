import { StyleSheet, useColorScheme } from 'react-native'

import { type ColorScheme, darkColors, lightColors, stateLayerOpacity } from './colors'
import { elevation, shape, spacing } from './dimensions'
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

// Follows the OS appearance (app.json: userInterfaceStyle = automatic).
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme
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
export { fontAssets, fontFamily, text, typography } from './typography'
export type { FontWeight, TypographyRole } from './typography'
