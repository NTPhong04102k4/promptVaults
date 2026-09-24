import { createContext, type ReactNode, useContext } from 'react'
import { Pressable, View } from 'react-native'

import { Icon, type IconName } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

const GroupContext = createContext<{ value: string | null; onValueChange: (value: string) => void } | null>(
  null,
)

type GroupProps = { value: string | null; onValueChange: (value: string) => void; children: ReactNode }

function Group({ value, onValueChange, children }: GroupProps) {
  return <GroupContext.Provider value={{ value, onValueChange }}>{children}</GroupContext.Provider>
}

function Row({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return <View style={styles.row}>{children}</View>
}

type ToggleButtonProps = {
  icon: IconName
  value: string
  disabled?: boolean
  accessibilityLabel: string
  size?: number
}

function ToggleButtonBase({ icon, value, disabled, accessibilityLabel, size = 24 }: ToggleButtonProps) {
  const styles = useStyles()
  const { colors } = useTheme()
  const group = useContext(GroupContext)
  const checked = group?.value === value

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: checked }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => group?.onValueChange(value)}
      style={[styles.button, checked && styles.buttonChecked, disabled && styles.buttonDisabled]}
    >
      <Icon name={icon} size={size} color={checked ? colors.onSecondaryContainer : colors.onSurfaceVariant} />
    </Pressable>
  )
}

export const ToggleButton = Object.assign(ToggleButtonBase, { Group, Row })

const useStyles = makeStyles(({ colors, shape, stateLayerOpacity }) => ({
  row: { flexDirection: 'row', borderWidth: 1, borderColor: colors.outline, borderRadius: shape.small, overflow: 'hidden' },
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  buttonChecked: { backgroundColor: colors.secondaryContainer },
  buttonDisabled: { opacity: stateLayerOpacity.disabledContent },
}))
