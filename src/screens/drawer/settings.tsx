import { useEffect, useState } from 'react'
import { Alert, Switch, View } from 'react-native'
import Constants from 'expo-constants'

import { SettingsRow } from '@/components/ui'
import { isAppLockEnabled, setAppLockEnabled } from '@/lib/appLock'
import { authenticateWithBiometric, isBiometricAvailable } from '@/lib/biometric'
import { push } from '@/navigation'
import { makeStyles, useTheme } from '@/theme'

export default function SettingsScreen() {
  const { colors } = useTheme()
  const styles = useStyles()
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [lockEnabled, setLockEnabled] = useState(false)

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable)
    isAppLockEnabled().then(setLockEnabled)
  }, [])

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
