import { Pressable, Text } from 'react-native'

import { Icon } from '@/components/Icon'
import { makeStyles, text, useTheme } from '@/theme'

type Props = {
  label: string
  selected: boolean
  onPress: () => void
}

export function FilterChip({ label, selected, onPress }: Props) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.selected : styles.unselected]}
    >
      {selected && <Icon name="check" size={16} color={colors.onSecondaryContainer} />}
      <Text style={selected ? styles.selectedLabel : styles.label}>{label}</Text>
    </Pressable>
  )
}

const useStyles = makeStyles(({ colors, shape, spacing }) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: shape.small,
  },
  selected: { backgroundColor: colors.secondaryContainer },
  unselected: { borderWidth: 1, borderColor: colors.outlineVariant },
  label: { ...text('labelLarge', 'medium'), color: colors.onSurfaceVariant },
  selectedLabel: { ...text('labelLarge', 'medium'), color: colors.onSecondaryContainer },
}))
