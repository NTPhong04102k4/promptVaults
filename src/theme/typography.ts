import type { TextStyle } from 'react-native'
import * as Roboto from '@expo-google-fonts/roboto'

// Roboto is bundled per weight, so each weight is its own fontFamily.
export const fontFamily = {
  regular: 'Roboto_400Regular',
  medium: 'Roboto_500Medium',
  semiBold: 'Roboto_600SemiBold',
  bold: 'Roboto_700Bold',
} as const

export type FontWeight = keyof typeof fontFamily

// Load once in the root layout (useFonts) before rendering text.
export const fontAssets = {
  [fontFamily.regular]: Roboto.Roboto_400Regular,
  [fontFamily.medium]: Roboto.Roboto_500Medium,
  [fontFamily.semiBold]: Roboto.Roboto_600SemiBold,
  [fontFamily.bold]: Roboto.Roboto_700Bold,
}

// Material 3 type scale — matches Figma text styles "M3/<role>/<size>".

type TypeStyle = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'>

export const typography = {
  displayLarge: {
    fontFamily: fontFamily.regular,
    fontSize: 57,
    lineHeight: 64,
    letterSpacing: -0.25,
  },
  displayMedium: { fontFamily: fontFamily.regular, fontSize: 45, lineHeight: 52, letterSpacing: 0 },
  displaySmall: { fontFamily: fontFamily.regular, fontSize: 36, lineHeight: 44, letterSpacing: 0 },
  headlineLarge: { fontFamily: fontFamily.regular, fontSize: 32, lineHeight: 40, letterSpacing: 0 },
  headlineMedium: {
    fontFamily: fontFamily.regular,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: 0,
  },
  headlineSmall: { fontFamily: fontFamily.regular, fontSize: 24, lineHeight: 32, letterSpacing: 0 },
  titleLarge: { fontFamily: fontFamily.regular, fontSize: 22, lineHeight: 28, letterSpacing: 0 },
  titleMedium: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 24, letterSpacing: 0.15 },
  titleSmall: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  bodyLarge: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24, letterSpacing: 0.5 },
  bodyMedium: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, letterSpacing: 0.25 },
  bodySmall: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  labelLarge: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  labelMedium: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  labelSmall: { fontFamily: fontFamily.medium, fontSize: 11, lineHeight: 16, letterSpacing: 0.5 },
} as const satisfies Record<string, TypeStyle>

export type TypographyRole = keyof typeof typography

// Override the weight of a type role, e.g. text('bodyLarge', 'bold').
export function text(role: TypographyRole, weight?: FontWeight): TypeStyle {
  return weight ? { ...typography[role], fontFamily: fontFamily[weight] } : typography[role]
}
