import { Alert, Pressable, Text, View } from 'react-native'

import { Icon } from '@/components/Icon'
import { goBack } from '@/navigation'
import { makeStyles, text, useTheme } from '@/theme'

// Only the personal vault exists today; shared/group vaults are a future feature.
export default function VaultSwitcherScreen() {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chọn kho lưu trữ</Text>

      <Pressable style={styles.row} onPress={() => goBack('home')}>
        <View style={styles.rowLeading}>
          <Icon name="lock" size={20} color={colors.onSurfaceVariant} />
          <Text style={styles.label}>Kho cá nhân</Text>
        </View>
        <Icon name="check" size={20} color={colors.primary} />
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={() => Alert.alert('Kho lưu trữ nhóm', 'Tính năng này sắp ra mắt.')}
      >
        <View style={styles.rowLeading}>
          <Icon name="add" size={20} color={colors.primary} />
          <Text style={styles.newLabel}>Tạo kho mới</Text>
        </View>
      </Pressable>
    </View>
  )
}

const useStyles = makeStyles(({ colors, spacing }) => ({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  title: { ...text('headlineSmall'), color: colors.onSurface, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowLeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...text('bodyLarge'), color: colors.onSurface },
  newLabel: { ...text('bodyLarge'), color: colors.primary },
}))
