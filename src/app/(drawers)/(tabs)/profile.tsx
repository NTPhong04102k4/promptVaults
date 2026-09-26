import { Alert, Pressable, Text, View } from 'react-native'

import { Avatar, SettingsRow } from '@/components/ui'
import { pendingChanges } from '@/lib/accountData'
import { getDisplayName, getInitials } from '@/lib/format'
import { runSync } from '@/lib/syncEngine'
import { push, replace } from '@/navigation'
import { useAuthStore } from '@/store'
import { makeStyles, text } from '@/theme'

export default function ProfileScreen() {
  const styles = useStyles()
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)

  // signOut() is the single sign-out seam — it wipes synced data and resets the space
  // itself (Task 17 fix round 1, issue 1). This handler only owns the unsynced-changes
  // confirmation in front of it.
  async function handleSignOut() {
    const finish = async () => {
      await signOut()
      replace('welcome')
    }
    const pending = await pendingChanges()
    if (pending === 0) {
      await finish()
      return
    }
    Alert.alert(
      'Còn thay đổi chưa đồng bộ',
      `Có ${pending} thay đổi chưa đồng bộ. Đăng xuất sẽ mất chúng.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Đồng bộ rồi đăng xuất',
          onPress: async () => {
            await runSync()
            if ((await pendingChanges()) === 0) await finish()
            else Alert.alert('Chưa đồng bộ xong', 'Hãy thử lại khi có mạng.')
          },
        },
        { text: 'Vẫn đăng xuất', style: 'destructive', onPress: finish },
      ],
    )
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.accountRow}
        onPress={() => (user ? undefined : push('login'))}
        disabled={!!user}
      >
        <Avatar label={getInitials(user)} size={56} />
        <View style={styles.accountText}>
          <Text style={styles.name}>{getDisplayName(user)}</Text>
          <Text style={styles.status}>
            {user ? `Đã đồng bộ với ${user.email}` : 'Đăng nhập để đồng bộ'}
          </Text>
        </View>
      </Pressable>

      <View style={styles.rows}>
        <SettingsRow
          icon="settings"
          label="Kho lưu trữ cá nhân"
          onPress={() => push('vaultSwitcher')}
        />
        <SettingsRow icon="settings" label="Đồng bộ" onPress={() => push('sync')} />
        <SettingsRow icon="settings" label="Cài đặt" onPress={() => push('settings')} />
        {user ? (
          <>
            <SettingsRow
              icon="settings"
              label="Thiết bị đăng nhập"
              onPress={() => push('sessions')}
            />
            <SettingsRow icon="settings" label="Đăng xuất" onPress={handleSignOut} />
          </>
        ) : (
          <SettingsRow icon="settings" label="Đăng nhập" onPress={() => push('login')} />
        )}
      </View>
    </View>
  )
}

const useStyles = makeStyles(({ colors, shape, spacing }) => ({
  container: { flex: 1, gap: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: shape.medium,
    backgroundColor: colors.surfaceContainerLowest,
  },
  accountText: { flex: 1, gap: spacing.xxs },
  name: { ...text('titleMedium', 'medium'), color: colors.onSurface },
  status: { ...text('bodyMedium'), color: colors.primary },
  rows: { gap: spacing.md },
}))
