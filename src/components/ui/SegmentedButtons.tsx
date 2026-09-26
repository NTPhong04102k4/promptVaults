import { Pressable, Text, View } from 'react-native'

import { Icon, type IconName } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

type SegmentedButtonItem = { value: string; label: string; icon?: IconName; disabled?: boolean }

type Props = {
  value: string
  onValueChange: (value: string) => void
  buttons: SegmentedButtonItem[]
}

export function SegmentedButtons({ value, onValueChange, buttons }: Props) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <View style={styles.container}>
      {buttons.map((button, index) => {
        const checked = button.value === value
        return (
          <Pressable
            key={button.value}
            accessibilityRole="button"
            accessibilityState={{ selected: checked, disabled: button.disabled }}
            disabled={button.disabled}
            onPress={() => onValueChange(button.value)}
            style={[
              styles.segment,
              checked && styles.segmentChecked,
              index > 0 && styles.segmentBorder,
              button.disabled && styles.segmentDisabled,
            ]}
          >
            {button.icon && (
              <Icon
                name={button.icon}
                size={18}
                color={checked ? colors.onSecondaryContainer : colors.onSurfaceVariant}
              />
            )}
            <Text style={[styles.label, checked && styles.labelChecked]}>{button.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const useStyles = makeStyles(({ colors, shape, spacing, typography, stateLayerOpacity }) => ({
  container: {
    flexDirection: 'row',
    height: 40,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: shape.full,
    overflow: 'hidden',
  },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  segmentBorder: { borderLeftWidth: 1, borderLeftColor: colors.outline },
  segmentChecked: { backgroundColor: colors.secondaryContainer },
  segmentDisabled: { opacity: stateLayerOpacity.disabledContent },
  label: { ...typography.labelLarge, color: colors.onSurface },
  labelChecked: { color: colors.onSecondaryContainer },
}))
