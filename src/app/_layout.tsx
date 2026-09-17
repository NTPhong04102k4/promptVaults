import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { isAppLockEnabled } from '@/lib/appLock';
import { authenticateWithBiometric } from '@/lib/biometric';

export default function RootLayout() {
  const [checked, setChecked] = useState(false);
  const [locked, setLocked] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  async function checkLock() {
    const enabled = await isAppLockEnabled();
    setLocked(enabled);
    setChecked(true);
  }

  useEffect(() => {
    checkLock();
    const subscription = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        checkLock();
      }
      appState.current = next;
    });
    return () => subscription.remove();
  }, []);

  async function handleUnlock() {
    const success = await authenticateWithBiometric();
    if (success) setLocked(false);
  }

  if (!checked) return null;

  if (locked) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>PromptVault đã khoá</Text>
        <Pressable style={styles.button} onPress={handleUnlock}>
          <Text style={styles.buttonText}>Mở khoá</Text>
        </Pressable>
      </View>
    );
  }

  return <Stack />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  button: { backgroundColor: '#208AEF', borderRadius: 8, padding: 14 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
