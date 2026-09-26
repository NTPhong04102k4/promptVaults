import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Icon, type IconName } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

type ItemProps = { label: string; icon?: IconName; active?: boolean; onPress: () => void }

function Item({ label, icon, active, onPress }: ItemProps) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.item, active && styles.itemActive]}
    >
      {icon && <Icon name={icon} size={24} color={active ? colors.onSecondaryContainer : colors.onSurfaceVariant} />}
      <Text style={[styles.itemLabel, active && styles.itemLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

type SectionProps = { title?: string; children: ReactNode }

function Section({ title, children }: SectionProps) {
  const styles = useStyles()
  return (
    <View style={styles.section}>
      {title && <Text style={styles.sectionTitle}>{title}</Text>}
      {children}
    </View>
  )
}

type CollapsedItemProps = { label: string; icon: IconName; active?: boolean; onPress: () => void }

function CollapsedItem({ label, icon, active, onPress }: CollapsedItemProps) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.collapsedItem}
    >
      <View style={[styles.collapsedIconWrap, active && styles.itemActive]}>
        <Icon name={icon} size={24} color={active ? colors.onSecondaryContainer : colors.onSurfaceVariant} />
      </View>
      <Text style={styles.collapsedLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

export const Drawer = { Item, Section, CollapsedItem }

const useStyles = makeStyles(({ colors, shape, spacing, typography }) => ({
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 56, paddingHorizontal: spacing.md, borderRadius: shape.full },
  itemActive: { backgroundColor: colors.secondaryContainer },
  itemLabel: { ...typography.labelLarge, color: colors.onSurfaceVariant },
  itemLabelActive: { color: colors.onSecondaryContainer },
  section: { paddingVertical: spacing.sm, gap: spacing.xxs },
  sectionTitle: { ...typography.titleSmall, color: colors.onSurfaceVariant, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  collapsedItem: { alignItems: 'center', gap: spacing.xxs, width: 64 },
  collapsedIconWrap: { width: 56, height: 32, borderRadius: shape.full, alignItems: 'center', justifyContent: 'center' },
  collapsedLabel: { ...typography.labelMedium, color: colors.onSurfaceVariant },
}))
