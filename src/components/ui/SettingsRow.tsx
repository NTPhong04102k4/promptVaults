import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Icon, type IconName } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

type Props = {
  icon: IconName
  label: string
  onPress: () => void
  // Overrides the default trailing chevron, e.g. with a Switch.
  trailing?: ReactNode
}

export function SettingsRow({ icon, label, onPress, trailing }: Props) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={20} color={colors.onSurfaceVariant} />
      </View>
      <Text style={styles.label}>{label}</Text>
      {trailing ?? <Icon name="chevronRight" size={20} color={colors.onSurfaceVariant} />}
    </Pressable>
  )
}

const useStyles = makeStyles(({ colors, typography, shape, spacing }) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: shape.medium,
    backgroundColor: colors.surfaceContainerLowest,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: shape.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHighest,
  },
  label: { flex: 1, ...typography.bodyLarge, color: colors.onSurface },
}))
