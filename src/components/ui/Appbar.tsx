import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Icon, type IconName } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

function Header({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return <View style={styles.header}>{children}</View>
}

type ContentProps = { title: string; subtitle?: string }

function Content({ title, subtitle }: ContentProps) {
  const styles = useStyles()
  return (
    <View style={styles.content}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {subtitle && (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      )}
    </View>
  )
}

type ActionProps = { icon: IconName; onPress: () => void; accessibilityLabel: string; disabled?: boolean }

function Action({ icon, onPress, accessibilityLabel, disabled }: ActionProps) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={styles.action}
    >
      <Icon name={icon} size={24} color={disabled ? colors.outlineVariant : colors.onSurface} />
    </Pressable>
  )
}

function BackAction({ onPress }: { onPress: () => void }) {
  return <Action icon="back" onPress={onPress} accessibilityLabel="Quay lại" />
}

export const Appbar = { Header, Content, Action, BackAction }

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: spacing.xs, backgroundColor: colors.surface },
  content: { flex: 1, paddingHorizontal: spacing.md },
  title: { ...typography.titleLarge, color: colors.onSurface },
  subtitle: { ...typography.bodySmall, color: colors.onSurfaceVariant },
  action: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
}))
