import type { ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'

import { useTheme } from '@/theme'

// M3 elevation tiers map to the app's surface-container tokens (higher level = more tint).
const ELEVATION_COLOR = [
  'surface',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
] as const

type Props = {
  elevation?: 0 | 1 | 2 | 3 | 4 | 5
  style?: ViewStyle
  children?: ReactNode
}

export function Surface({ elevation = 1, style, children }: Props) {
  const { colors } = useTheme()

  return (
    <View
      style={[
        { backgroundColor: colors[ELEVATION_COLOR[elevation]] },
        elevation > 0 && {
          elevation,
          shadowColor: colors.shadow,
          shadowOpacity: 0.2,
          shadowRadius: elevation * 1.5,
          shadowOffset: { width: 0, height: elevation / 2 },
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
