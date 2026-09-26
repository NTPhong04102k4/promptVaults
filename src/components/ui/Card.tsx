import type { ReactNode } from 'react'
import { Image, type ImageSourcePropType, Pressable, Text, View } from 'react-native'

import { makeStyles } from '@/theme'

type CardProps = {
  mode?: 'elevated' | 'outlined' | 'contained'
  onPress?: () => void
  children: ReactNode
}

function CardBase({ mode = 'elevated', onPress, children }: CardProps) {
  const styles = useStyles()

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={[styles.base, styles[mode]]}>
        {children}
      </Pressable>
    )
  }

  return <View style={[styles.base, styles[mode]]}>{children}</View>
}

function Content({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return <View style={styles.content}>{children}</View>
}

function Actions({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return <View style={styles.actions}>{children}</View>
}

function Cover({ source }: { source: ImageSourcePropType }) {
  const styles = useStyles()
  return <Image source={source} style={styles.cover} />
}

type TitleProps = { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode }

function Title({ title, subtitle, left, right }: TitleProps) {
  const styles = useStyles()
  return (
    <View style={styles.titleRow}>
      {left}
      <View style={styles.titleText}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  )
}

export const Card = Object.assign(CardBase, { Content, Actions, Cover, Title })

const useStyles = makeStyles(({ colors, shape, spacing, typography, elevation }) => ({
  base: { borderRadius: shape.medium, overflow: 'hidden', backgroundColor: colors.surfaceContainerLow },
  elevated: {
    elevation: elevation.level1,
    shadowColor: colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  outlined: { borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surface },
  contained: { backgroundColor: colors.surfaceContainerHighest },
  content: { padding: spacing.lg },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, padding: spacing.sm },
  cover: { width: '100%', height: 194 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  titleText: { flex: 1 },
  title: { ...typography.titleMedium, color: colors.onSurface },
  subtitle: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
}))
