import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { makeStyles, text, useTheme } from '@/theme'

type Props = {
  label: string
  onPress: () => void
  // filled = primary action; tonal = secondary surface action (e.g. "Sign in with Google").
  variant?: 'filled' | 'tonal'
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
}

export function Button({ label, onPress, variant = 'filled', icon, loading, disabled }: Props) {
  const styles = useStyles()
  const { colors, stateLayerOpacity } = useTheme()
  const inactive = disabled || loading
  const filled = variant === 'filled'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        filled ? styles.filled : styles.tonal,
        disabled && styles.disabled,
        pressed && { opacity: 1 - stateLayerOpacity.pressed },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={filled ? colors.onPrimary : colors.primary} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={filled ? styles.filledLabel : styles.tonalLabel}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

const useStyles = makeStyles(({ colors, shape, spacing, stateLayerOpacity }) => ({
  base: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  filled: { backgroundColor: colors.primary, borderRadius: shape.full },
  tonal: { backgroundColor: colors.surfaceContainer, borderRadius: shape.small },
  disabled: { opacity: stateLayerOpacity.disabledContent },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filledLabel: { ...text('labelLarge', 'semiBold'), fontSize: 16, color: colors.onPrimary },
  tonalLabel: { ...text('labelLarge', 'medium'), fontSize: 16, color: colors.onSurface },
}))
