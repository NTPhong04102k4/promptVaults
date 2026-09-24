import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from 'expo-router'

import { fontFamily, type Theme } from '@/theme'

// Map the M3 theme onto React Navigation's theme so headers, tab bars and drawers match.
export function toNavigationTheme(theme: Theme): NavigationTheme {
  const base = theme.dark ? DarkTheme : DefaultTheme
  const { colors } = theme
  return {
    ...base,
    dark: theme.dark,
    colors: {
      primary: colors.primary,
      background: colors.surface,
      card: colors.surfaceContainer,
      text: colors.onSurface,
      border: colors.outlineVariant,
      notification: colors.error,
    },
    fonts: {
      regular: { fontFamily: fontFamily.regular, fontWeight: '400' },
      medium: { fontFamily: fontFamily.medium, fontWeight: '500' },
      bold: { fontFamily: fontFamily.bold, fontWeight: '700' },
      heavy: { fontFamily: fontFamily.bold, fontWeight: '700' },
    },
  }
}
