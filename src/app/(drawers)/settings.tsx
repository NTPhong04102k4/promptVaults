import { useEffect, useState } from 'react'
import { Alert, Switch, View } from 'react-native'
import Constants from 'expo-constants'

import { SettingsRow } from '@/components/ui'
import { isAppLockEnabled, setAppLockEnabled } from '@/lib/appLock'
import { toAuthError } from '@/lib/authForm'
import { authenticateWithBiometric, isBiometricAvailable } from '@/lib/biometric'
import {
  disableBiometricLogin,
  enableBiometricLogin,
  getBiometricEnrollment,
} from '@/lib/biometricLogin'
import { push } from '@/navigation'
import { useAuthStore } from '@/store'
import { makeStyles, useTheme } from '@/theme'

export default function SettingsScreen() {
  const { colors } = useTheme()
  const styles = useStyles()
  const user = useAuthStore((state) => state.user)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [lockEnabled, setLockEnabled] = useState(false)
  const [biometricLogin, setBiometricLogin] = useState(false)

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable)
    isAppLockEnabled().then(setLockEnabled)
    getBiometricEnrollment().then((e) => setBiometricLogin(e !== null))
  }, [])

  async function handleToggleBiometricLogin(next: boolean) {
    try {
      if (next) {
        await enableBiometricLogin({ userCode: user?.userCode ?? null, email: user?.email ?? null })
      } else {
        await disableBiometricLogin()
      }
      setBiometricLogin(next)
    } catch (e) {
      // 403 on register: this session was issued for a different deviceId (spec §0 C26).
      const message =
        e instanceof Error && e.message === 'biometric_device_mismatch'
          ? 'Hãy đăng xuất rồi đăng nhập lại trên thiết bị này, sau đó bật lại.'
          : toAuthError(e).message
      Alert.alert('Không đổi được cài đặt', message)
    }
  }

  async function handleToggleLock(next: boolean) {
    if (next) {
      const confirmed = await authenticateWithBiometric()
      if (!confirmed) return
    }
    await setAppLockEnabled(next)
    setLockEnabled(next)
  }

  return (
    <View style={styles.container}>
      <SettingsRow
        icon="settings"
        label="Giao diện sáng / tối"
        onPress={() => Alert.alert('Giao diện sáng / tối', 'Hiện đang theo giao diện hệ thống.')}
      />
      {(biometricAvailable || lockEnabled) && (
        <SettingsRow
          icon="lock"
          label="Khoá bằng vân tay / Face ID"
          onPress={() => handleToggleLock(!lockEnabled)}
          trailing={
            <Switch
              value={lockEnabled}
              onValueChange={handleToggleLock}
              trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
              thumbColor={lockEnabled ? colors.onPrimary : colors.outline}
            />
          }
        />
      )}
      {user?.userCode && biometricAvailable && (
        <SettingsRow
          icon="lock"
          label="Đăng nhập bằng vân tay / Face ID"
          onPress={() => handleToggleBiometricLogin(!biometricLogin)}
          trailing={
            <Switch
              value={biometricLogin}
              onValueChange={handleToggleBiometricLogin}
              trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
              thumbColor={biometricLogin ? colors.onPrimary : colors.outline}
            />
          }
        />
      )}
      <SettingsRow icon="settings" label="Sao lưu & đồng bộ" onPress={() => push('sync')} />
      <SettingsRow
        icon="settings"
        label="Về PromptVault"
        onPress={() =>
          Alert.alert('PromptVault', `Phiên bản ${Constants.expoConfig?.version ?? '1.0.0'}`)
        }
      />
    </View>
  )
}

const useStyles = makeStyles(({ colors, spacing }) => ({
  container: { flex: 1, gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface },
}))
