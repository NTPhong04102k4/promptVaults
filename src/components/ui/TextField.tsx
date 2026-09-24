import { type ReactNode, useState } from 'react'
import { Pressable, Text, TextInput, type TextInputProps, View } from 'react-native'

import { Icon } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

type Props = Omit<TextInputProps, 'style' | 'secureTextEntry'> & {
  label: string
  error?: string | null | undefined
  // Shows a visibility toggle and hides the value by default.
  secure?: boolean
  // Rendered at the end of the label row (e.g. a "Forgot password" link).
  labelAction?: ReactNode
}

export function TextField({ label, error, secure, labelAction, onFocus, onBlur, ...input }: Props) {
  const styles = useStyles()
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(true)

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {labelAction}
      </View>

      <View style={[styles.field, focused && styles.fieldFocused, !!error && styles.fieldError]}>
        <TextInput
          {...input}
          accessibilityLabel={label}
          secureTextEntry={secure && hidden}
          placeholderTextColor={colors.outline}
          selectionColor={colors.primary}
          style={styles.input}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Hiện mật khẩu' : 'Ẩn mật khẩu'}
            hitSlop={8}
            onPress={() => setHidden((h) => !h)}
          >
            <Icon name={hidden ? 'visibilityOff' : 'visibility'} color={colors.onSurfaceVariant} />
          </Pressable>
        )}
      </View>

      {error && (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon name="warning" size={16} color={colors.error} />
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
    </View>
  )
}

const useStyles = makeStyles(({ colors, typography, shape, spacing }) => ({
  container: { gap: spacing.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.bodyMedium, color: colors.onSurface },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: shape.small,
    backgroundColor: colors.surfaceContainerLowest,
  },
  fieldFocused: { borderColor: colors.primary },
  fieldError: { borderColor: colors.error },
  input: { flex: 1, height: '100%', ...typography.bodyLarge, color: colors.onSurface },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  error: { ...typography.bodySmall, color: colors.error },
}))
