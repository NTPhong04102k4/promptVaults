import { useEffect, useState } from 'react'
import { Animated, Easing, View, type ViewStyle } from 'react-native'

import { useTheme } from '@/theme'

type Props = {
  progress?: number
  color?: string
  indeterminate?: boolean
  visible?: boolean
  style?: ViewStyle
}

export function ProgressBar({ progress = 0, color, indeterminate, visible = true, style }: Props) {
  const { colors } = useTheme()
  const [trackWidth, setTrackWidth] = useState(0)
  // useState (not useRef) so reading `.interpolate()` during render isn't a ref access.
  const [width] = useState(() => new Animated.Value(0))
  const [spin] = useState(() => new Animated.Value(0))

  useEffect(() => {
    if (indeterminate) return
    Animated.timing(width, {
      toValue: progress,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start()
  }, [progress, indeterminate, width])

  useEffect(() => {
    if (!indeterminate) return
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [indeterminate, spin])

  if (!visible) return null

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={[
        { height: 4, borderRadius: 2, backgroundColor: colors.surfaceContainerHighest, overflow: 'hidden' },
        style,
      ]}
    >
      {indeterminate ? (
        <Animated.View
          style={{
            height: '100%',
            width: '40%',
            borderRadius: 2,
            backgroundColor: color ?? colors.primary,
            transform: [
              {
                translateX: spin.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-trackWidth * 0.4, trackWidth],
                }),
              },
            ],
          }}
        />
      ) : (
        <Animated.View
          style={{
            height: '100%',
            borderRadius: 2,
            backgroundColor: color ?? colors.primary,
            width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }}
        />
      )}
    </View>
  )
}
