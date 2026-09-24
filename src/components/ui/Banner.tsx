import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

import { makeStyles } from '@/theme'

import { Button } from './Button'

type Action = { label: string; onPress: () => void }

type Props = {
  visible: boolean
  children: string
  icon?: ReactNode
  actions?: Action[]
}

export function Banner({ visible, children, icon, actions = [] }: Props) {
  const styles = useStyles()
  if (!visible) return null

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {icon}
        <Text style={styles.text}>{children}</Text>
      </View>
      {actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((action) => (
            <Button key={action.label} label={action.label} onPress={action.onPress} variant="tonal" />
          ))}
        </View>
      )}
    </View>
  )
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  container: { backgroundColor: colors.surfaceContainerLowest, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  text: { flex: 1, ...typography.bodyMedium, color: colors.onSurface },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
}))
