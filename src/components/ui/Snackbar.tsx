import { useEffect, useState } from 'react'
import { Animated, Pressable, Text } from 'react-native'

import { makeStyles } from '@/theme'

type Action = { label: string; onPress: () => void }

type Props = {
  visible: boolean
  onDismiss: () => void
  // Pass Infinity to require the action/dismiss instead of auto-hiding.
  duration?: number
  action?: Action
  children: string
}

export function Snackbar({ visible, onDismiss, duration = 4000, action, children }: Props) {
  const styles = useStyles()
  // useState (not useRef) so reading the Animated.Value during render isn't a ref access.
  const [translateY] = useState(() => new Animated.Value(80))

  useEffect(() => {
    if (!visible) return
    translateY.setValue(80)
    Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }).start()
    if (duration === Infinity) return
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [visible, duration, onDismiss, translateY])

  if (!visible) return null

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      <Text style={styles.text} numberOfLines={2}>
        {children}
      </Text>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      )}
    </Animated.View>
  )
}

const useStyles = makeStyles(({ colors, typography, shape, spacing }) => ({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: shape.extraSmall,
    backgroundColor: colors.inverseSurface,
  },
  text: { flex: 1, ...typography.bodyMedium, color: colors.inverseOnSurface },
  action: { ...typography.labelLarge, color: colors.inversePrimary },
}))
