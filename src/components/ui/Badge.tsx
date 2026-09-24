import { Text, View, type ViewStyle } from 'react-native'

import { text, useTheme } from '@/theme'

type Props = {
  visible?: boolean
  size?: number
  // Omit for a plain dot; a number over 99 renders as "99+".
  children?: number | string
  style?: ViewStyle
}

export function Badge({ visible = true, size = 18, children, style }: Props) {
  const { colors } = useTheme()
  if (!visible) return null

  const isDot = children === undefined
  const dimension = isDot ? 8 : size
  const label = typeof children === 'number' && children > 99 ? '99+' : children

  return (
    <View
      style={[
        {
          minWidth: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          paddingHorizontal: isDot ? 0 : 4,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.error,
        },
        style,
      ]}
    >
      {!isDot && (
        <Text style={{ ...text('labelSmall'), fontSize: dimension * 0.55, color: colors.onError }}>
          {label}
        </Text>
      )}
    </View>
  )
}
