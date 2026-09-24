import type { ReactNode } from 'react'
import { Pressable, type StyleProp, type ViewStyle } from 'react-native'

import { useTheme } from '@/theme'

type Props = {
  onPress?: () => void
  onLongPress?: () => void
  disabled?: boolean
  rippleColor?: string
  borderless?: boolean
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

export function TouchableRipple({
  onPress,
  onLongPress,
  disabled,
  rippleColor,
  borderless,
  children,
  style,
}: Props) {
  const { colors, stateLayerOpacity } = useTheme()

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      android_ripple={{ color: rippleColor ?? colors.onSurface, borderless: !!borderless }}
      style={({ pressed }) => [
        style,
        pressed && { opacity: 1 - stateLayerOpacity.pressed },
        disabled && { opacity: stateLayerOpacity.disabledContent },
      ]}
    >
      {children}
    </Pressable>
  )
}
