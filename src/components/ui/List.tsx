import { type ReactNode, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Icon, type IconName } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

type ItemProps = { title: string; description?: string; left?: ReactNode; right?: ReactNode; onPress?: () => void }

function Item({ title, description, left, right, onPress }: ItemProps) {
  const styles = useStyles()
  const content = (
    <>
      {left}
      <View style={styles.itemText}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {title}
        </Text>
        {description && (
          <Text style={styles.itemDescription} numberOfLines={2}>
            {description}
          </Text>
        )}
      </View>
      {right}
    </>
  )

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.item}>
        {content}
      </Pressable>
    )
  }

  return <View style={styles.item}>{content}</View>
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View>
      {title && <Subheader>{title}</Subheader>}
      {children}
    </View>
  )
}

function Subheader({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return <Text style={styles.subheader}>{children}</Text>
}

function ListIcon({ icon, color }: { icon: IconName; color?: string }) {
  const styles = useStyles()
  const { colors } = useTheme()
  return (
    <View style={styles.iconWrap}>
      <Icon name={icon} size={24} color={color ?? colors.onSurfaceVariant} />
    </View>
  )
}

type AccordionProps = { title: string; left?: ReactNode; children: ReactNode }

function Accordion({ title, left, children }: AccordionProps) {
  const styles = useStyles()
  const { colors } = useTheme()
  const [expanded, setExpanded] = useState(false)

  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => setExpanded((e) => !e)} style={styles.item}>
        {left}
        <Text style={[styles.itemTitle, styles.itemText]} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
          <Icon name="chevronRight" size={20} color={colors.onSurfaceVariant} />
        </View>
      </Pressable>
      {expanded && <View>{children}</View>}
    </View>
  )
}

export const List = { Item, Section, Subheader, Icon: ListIcon, Accordion }

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 56 },
  itemText: { flex: 1 },
  itemTitle: { ...typography.bodyLarge, color: colors.onSurface },
  itemDescription: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
  subheader: { ...typography.titleSmall, color: colors.primary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  iconWrap: { width: 40, alignItems: 'center', justifyContent: 'center' },
}))
