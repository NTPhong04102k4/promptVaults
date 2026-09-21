import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { isAppLockEnabled } from '@/lib/appLock';
import { authenticateWithBiometric } from '@/lib/biometric';
import { isOAuthInProgress } from '@/lib/oauthState';
import { getSession, onAuthStateChange } from '@/lib/auth';
import { useSessionStore } from '@/store/sessionStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>PromptVault đã khoá</Text>
      <Pressable
        style={[styles.button, { backgroundColor: theme.colors.primary, borderRadius: theme.spacing.radius.md }]}
        onPress={onUnlock}
      >
        <Text style={styles.buttonText}>Mở khoá</Text>
      </Pressable>
    </View>
  );
}

function RootNavigator() {
  const [checked, setChecked] = useState(false);
  const [locked, setLocked] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const setSession = useSessionStore((s) => s.setSession);

  async function checkLock() {
    const enabled = await isAppLockEnabled();
    setLocked(enabled);
    setChecked(true);
  }

  useEffect(() => {
    checkLock();
    const subscription = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active' && !isOAuthInProgress()) {
        checkLock();
      }
      appState.current = next;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    getSession().then(setSession);
    return onAuthStateChange(setSession);
  }, [setSession]);

  async function handleUnlock() {
    const success = await authenticateWithBiometric();
    if (success) setLocked(false);
  }

  if (!checked) return null;

  if (locked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return <Stack />;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  button: { padding: 14 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
