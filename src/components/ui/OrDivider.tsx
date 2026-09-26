import { Text, View } from 'react-native'

import { makeStyles } from '@/theme'

export function OrDivider({ label }: { label: string }) {
  const styles = useStyles()
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  )
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.outlineVariant },
  label: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
}))
