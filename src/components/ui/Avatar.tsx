import { StyleSheet, Text, type TextStyle, View, type ViewStyle } from 'react-native'

import { text, useTheme } from '@/theme'

// API mirrors react-native-paper's Avatar.Text (label/size/color/style/labelStyle/
// maxFontSizeMultiplier) without pulling in the dependency.
type Props = {
  label: string
  size?: number
  // Overrides the label color; background still comes from `style.backgroundColor` or the theme default.
  color?: string
  style?: ViewStyle
  labelStyle?: TextStyle
  maxFontSizeMultiplier?: number
}

// Initials avatar used in top app bars and the profile account row.
export function Avatar({ label, size = 32, color, style, labelStyle, maxFontSizeMultiplier }: Props) {
  const { colors } = useTheme()
  const { backgroundColor, ...restStyle } = StyleSheet.flatten(style) ?? {}

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: backgroundColor ?? colors.primaryContainer,
        },
        restStyle,
      ]}
    >
      <Text
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={[
          text('labelLarge', 'medium'),
          { fontSize: size * 0.4, color: color ?? colors.onPrimaryContainer },
          labelStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  )
}
