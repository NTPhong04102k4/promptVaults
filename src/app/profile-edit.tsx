import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'

import { Button, IconButton, TextField } from '@/components/ui'
import { changePassword, updateMe } from '@/lib/authApi'
import { toAuthError, validatePassword } from '@/lib/authForm'
import { goBack } from '@/navigation'
import { useAuthStore } from '@/store'
import { makeStyles, text } from '@/theme'

type ProfileErrors = { form?: string }
type PasswordErrors = { currentPassword?: string; newPassword?: string; form?: string }

export default function ProfileEditScreen() {
  const styles = useStyles()
  const user = useAuthStore((state) => state.user)
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({})
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({})
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)

  async function handleSaveProfile() {
    setProfileErrors({})
    setSavingProfile(true)
    try {
      await updateMe({ firstName: firstName.trim(), lastName: lastName.trim() })
      await useAuthStore.getState().refreshUser()
      goBack('profile')
    } catch (e) {
      setProfileErrors({ form: toAuthError(e).message })
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword() {
    const newPasswordError = validatePassword(newPassword)
    const next: PasswordErrors = {}
    if (!currentPassword) next.currentPassword = 'Vui lòng nhập mật khẩu hiện tại.'
    if (newPasswordError) next.newPassword = newPasswordError
    setPasswordErrors(next)
    if (Object.keys(next).length > 0) return

    setSavingPassword(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setPasswordChanged(true)
    } catch (e) {
      const { field, message } = toAuthError(e)
      // "InvalidCredentials" here means the current password was wrong.
      setPasswordErrors(field === 'password' ? { currentPassword: message } : { form: message })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.container}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Sửa hồ sơ</Text>
        <IconButton name="close" accessibilityLabel="Đóng" onPress={() => goBack('profile')} />
      </View>

      <View style={styles.section}>
        <TextField label="Tên" placeholder="Tên" value={firstName} onChangeText={setFirstName} />
        <TextField label="Họ" placeholder="Họ" value={lastName} onChangeText={setLastName} />
        {profileErrors.form && <Text style={styles.error}>{profileErrors.form}</Text>}
        <Button label="Lưu thông tin" onPress={handleSaveProfile} loading={savingProfile} />
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Đổi mật khẩu</Text>
        <TextField
          label="Mật khẩu hiện tại"
          placeholder="••••••••"
          secure
          autoComplete="current-password"
          textContentType="password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          error={passwordErrors.currentPassword}
        />
        <TextField
          label="Mật khẩu mới"
          placeholder="••••••••"
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          value={newPassword}
          onChangeText={setNewPassword}
          error={passwordErrors.newPassword}
        />
        {passwordErrors.form && <Text style={styles.error}>{passwordErrors.form}</Text>}
        {passwordChanged && <Text style={styles.success}>Đã đổi mật khẩu thành công.</Text>}
        <Button label="Đổi mật khẩu" onPress={handleChangePassword} loading={savingPassword} />
      </View>
    </ScrollView>
  )
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  container: { backgroundColor: colors.surface },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...text('headlineSmall'), color: colors.onSurface },
  section: { gap: spacing.lg },
  sectionTitle: { ...text('titleMedium', 'medium'), color: colors.onSurface },
  divider: { height: 1, backgroundColor: colors.outlineVariant },
  error: { ...typography.bodySmall, color: colors.error },
  success: { ...typography.bodySmall, color: colors.primary },
}))
