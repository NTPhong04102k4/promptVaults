import { Pressable, TextInput } from 'react-native'

import { Icon } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

type Props = {
  value: string
  onChangeText?: (text: string) => void
  placeholder: string
  // Home shows this read-only and taps through to the Search tab instead of typing in place.
  editable?: boolean
  onPress?: () => void
}

export function SearchBar({ value, onChangeText, placeholder, editable = true, onPress }: Props) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <Pressable
      onPress={onPress}
      disabled={editable || !onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? placeholder : undefined}
      style={styles.container}
    >
      <Icon name="search" size={20} color={colors.onSurfaceVariant} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.onSurfaceVariant}
        editable={editable}
        pointerEvents={editable ? 'auto' : 'none'}
      />
    </Pressable>
  )
}

const useStyles = makeStyles(({ colors, typography, shape, spacing }) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: shape.full,
    backgroundColor: colors.surfaceContainerHighest,
  },
  input: { flex: 1, height: '100%', ...typography.bodyLarge, color: colors.onSurface },
}))
