import { createContext, type ReactNode, useContext } from 'react'
import { Pressable, Text, View } from 'react-native'

import { makeStyles } from '@/theme'

const RadioGroupContext = createContext<{ value: string; onValueChange: (value: string) => void } | null>(
  null,
)

type GroupProps = { value: string; onValueChange: (value: string) => void; children: ReactNode }

function Group({ value, onValueChange, children }: GroupProps) {
  return <RadioGroupContext.Provider value={{ value, onValueChange }}>{children}</RadioGroupContext.Provider>
}

type RadioButtonProps = { value: string; disabled?: boolean | undefined; accessibilityLabel?: string }

function RadioButtonBase({ value, disabled, accessibilityLabel }: RadioButtonProps) {
  const styles = useStyles()
  const group = useContext(RadioGroupContext)
  const checked = group?.value === value

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => group?.onValueChange(value)}
      hitSlop={8}
    >
      <View style={[styles.circle, checked && styles.circleChecked]}>{checked && <View style={styles.dot} />}</View>
    </Pressable>
  )
}

type ItemProps = { label: string; value: string; disabled?: boolean }

function Item({ label, value, disabled }: ItemProps) {
  const styles = useStyles()
  const group = useContext(RadioGroupContext)

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: group?.value === value, disabled }}
      disabled={disabled}
      onPress={() => group?.onValueChange(value)}
      style={styles.itemRow}
    >
      <Text style={styles.itemLabel}>{label}</Text>
      <RadioButtonBase value={value} disabled={disabled} />
    </Pressable>
  )
}

export const RadioButton = Object.assign(RadioButtonBase, { Group, Item })

const useStyles = makeStyles(({ colors, spacing, typography }) => ({
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.onSurfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleChecked: { borderColor: colors.primary },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  itemLabel: { ...typography.bodyLarge, color: colors.onSurface },
}))
