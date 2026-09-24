import { type ReactElement, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { makeStyles } from '@/theme'

type Props = {
  title: string
  children: ReactElement
  enterTouchDelay?: number
  leaveTouchDelay?: number
}

export function Tooltip({ title, children, enterTouchDelay = 500, leaveTouchDelay = 1500 }: Props) {
  const styles = useStyles()
  const [visible, setVisible] = useState(false)

  return (
    <View>
      <Pressable
        delayLongPress={enterTouchDelay}
        onLongPress={() => setVisible(true)}
        onPressOut={() => setTimeout(() => setVisible(false), leaveTouchDelay)}
        accessibilityLabel={title}
      >
        {children}
      </Pressable>
      {visible && (
        <View style={styles.bubble} pointerEvents="none">
          <Text style={styles.label}>{title}</Text>
        </View>
      )}
    </View>
  )
}

const useStyles = makeStyles(({ colors, typography, shape, spacing }) => ({
  bubble: {
    position: 'absolute',
    bottom: '100%',
    alignSelf: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: shape.extraSmall,
    backgroundColor: colors.inverseSurface,
  },
  label: { ...typography.bodySmall, color: colors.inverseOnSurface },
}))
