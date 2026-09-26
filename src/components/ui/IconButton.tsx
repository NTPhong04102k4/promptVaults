import type { ColorValue } from 'react-native'
import { Pressable } from 'react-native'

import { Icon, type IconName } from '@/components/Icon'
import { useTheme } from '@/theme'

type Props = {
  name: IconName
  onPress: () => void
  accessibilityLabel: string
  size?: number
  color?: ColorValue
}

export function IconButton({ name, onPress, accessibilityLabel, size = 24, color }: Props) {
  const { colors } = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
    >
      <Icon name={name} size={size} color={color ?? colors.onSurface} />
    </Pressable>
  )
}
