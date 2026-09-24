import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import { Icon } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  accessibilityLabel: string
}

export function Checkbox({ checked, onChange, children, accessibilityLabel }: Props) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onChange(!checked)}
      style={styles.row}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Icon name="check" size={14} color={colors.onPrimary} />}
      </View>
      <View style={styles.label}>{children}</View>
    </Pressable>
  )
}

const useStyles = makeStyles(({ colors, spacing }) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  box: {
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.onSurfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { flex: 1 },
}))
