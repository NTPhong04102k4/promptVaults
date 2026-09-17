import { useEffect, useState } from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { isBiometricAvailable, authenticateWithBiometric } from '@/lib/biometric';
import { isAppLockEnabled, setAppLockEnabled } from '@/lib/appLock';

export default function SettingsScreen() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setAvailable);
    isAppLockEnabled().then(setEnabled);
  }, []);

  async function handleToggle(next: boolean) {
    if (next) {
      const confirmed = await authenticateWithBiometric();
      if (!confirmed) return;
    }
    await setAppLockEnabled(next);
    setEnabled(next);
  }

  if (!available) return null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>Khoá bằng vân tay/Face ID</Text>
        <Switch value={enabled} onValueChange={handleToggle} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 16 },
});
