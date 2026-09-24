import { Switch as RNSwitch } from 'react-native'

import { useTheme } from '@/theme'

type Props = {
  value: boolean
  onValueChange: (value: boolean) => void
  disabled?: boolean
  color?: string
}

export function Switch({ value, onValueChange, disabled, color }: Props) {
  const { colors } = useTheme()
  const onColor = color ?? colors.primary

  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.surfaceContainerHighest, true: onColor }}
      thumbColor={value ? colors.onPrimary : colors.outline}
      ios_backgroundColor={colors.surfaceContainerHighest}
    />
  )
}
