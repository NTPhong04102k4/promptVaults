import { Text, type TextProps, View, type ViewProps } from 'react-native'

import { type TypographyRole, useTheme } from '@/theme'

type ThemedViewProps = ViewProps & { variant?: 'background' | 'surface' }

export function ThemedView({ variant = 'background', style, ...rest }: ThemedViewProps) {
  const { colors } = useTheme()
  const backgroundColor = variant === 'surface' ? colors.surface : colors.background
  return <View style={[{ backgroundColor }, style]} {...rest} />
}

type ThemedTextProps = TextProps & {
  variant?: TypographyRole
  color?: 'primary' | 'secondary' | 'error'
}

export function ThemedText({ variant = 'bodyLarge', color, style, ...rest }: ThemedTextProps) {
  const { colors, typography } = useTheme()
  const role = typography[variant]
  const textColor =
    color === 'primary'
      ? colors.primary
      : color === 'secondary'
        ? colors.onSurfaceVariant
        : color === 'error'
          ? colors.error
          : colors.onSurface

  return <Text style={[role, { color: textColor }, style]} {...rest} />
}
