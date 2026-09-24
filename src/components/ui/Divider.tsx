import { View, type ViewStyle } from 'react-native'

import { useTheme } from '@/theme'

type Props = {
  bold?: boolean
  horizontalInset?: boolean
  style?: ViewStyle
}

export function Divider({ bold, horizontalInset, style }: Props) {
  const { colors, spacing } = useTheme()

  return (
    <View
      style={[
        { height: bold ? 2 : 1, backgroundColor: colors.outlineVariant },
        horizontalInset && { marginHorizontal: spacing.lg },
        style,
      ]}
    />
  )
}
