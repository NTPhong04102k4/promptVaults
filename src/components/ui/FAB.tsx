import { Pressable, Text, View, type ViewStyle } from 'react-native'

import { Icon, type IconName } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

type FABProps = {
  icon: IconName
  label?: string
  onPress: () => void
  disabled?: boolean
  accessibilityLabel?: string
  style?: ViewStyle
}

function FABBase({ icon, label, onPress, disabled, accessibilityLabel, style }: FABProps) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.fab, label ? styles.extended : styles.round, disabled && styles.disabled, style]}
    >
      <Icon name={icon} size={24} color={colors.onPrimaryContainer} />
      {label && <Text style={styles.label}>{label}</Text>}
    </Pressable>
  )
}

type FABAction = { icon: IconName; label: string; onPress: () => void }

type GroupProps = { open: boolean; icon: IconName; actions: FABAction[]; onPress: () => void }

function Group({ open, icon, actions, onPress }: GroupProps) {
  const styles = useStyles()

  if (!open) return <FABBase icon={icon} onPress={onPress} accessibilityLabel="Mở menu" />

  return (
    <View style={styles.groupContainer}>
      {actions.map((action) => (
        <View key={action.label} style={styles.groupItem}>
          <View style={styles.groupLabelWrap}>
            <Text style={styles.groupLabel}>{action.label}</Text>
          </View>
          <FABBase icon={action.icon} onPress={action.onPress} accessibilityLabel={action.label} />
        </View>
      ))}
      <FABBase icon={icon} onPress={onPress} accessibilityLabel="Đóng menu" />
    </View>
  )
}

export const FAB = Object.assign(FABBase, { Group })

const useStyles = makeStyles(({ colors, shape, spacing, typography, elevation, stateLayerOpacity }) => ({
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryContainer,
    elevation: elevation.level3,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  round: { width: 56, height: 56, borderRadius: shape.large },
  extended: { height: 56, paddingHorizontal: spacing.lg, borderRadius: shape.large },
  disabled: { opacity: stateLayerOpacity.disabledContent },
  label: { ...typography.labelLarge, color: colors.onPrimaryContainer },
  groupContainer: { alignItems: 'flex-end', gap: spacing.md },
  groupItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupLabelWrap: {
    backgroundColor: colors.surfaceContainerHighest,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: shape.extraSmall,
  },
  groupLabel: { ...typography.labelLarge, color: colors.onSurface },
}))
