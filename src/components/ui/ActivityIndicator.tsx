import { type ColorValue, ActivityIndicator as RNActivityIndicator } from 'react-native'

import { useTheme } from '@/theme'

type Props = {
  animating?: boolean
  color?: ColorValue
  size?: 'small' | 'large' | number
  // Renders nothing while `animating` is false, instead of a static indicator.
  hidesUntilAnimating?: boolean
}

export function ActivityIndicator({
  animating = true,
  color,
  size = 'small',
  hidesUntilAnimating = false,
}: Props) {
  const { colors } = useTheme()
  if (hidesUntilAnimating && !animating) return null

  return <RNActivityIndicator animating={animating} color={color ?? colors.primary} size={size} />
}
