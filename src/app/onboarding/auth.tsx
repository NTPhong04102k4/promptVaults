import { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from '@/lib/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemedView, ThemedText } from '@/components/Themed';

const ERROR_MESSAGES: Record<string, string> = {
  user_already_exists: 'Email này đã được đăng ký.',
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
};

function friendlyError(message: string): string {
  if (message.includes('duplicate key') && message.includes('username')) {
    return 'Username đã được sử dụng.';
  }
  return ERROR_MESSAGES[message] ?? 'Có lỗi xảy ra, thử lại sau.';
}

export default function AuthScreen() {
  const { theme } = useTheme();
  const { mode: initialMode } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signup' | 'signin'>(
    initialMode === 'signup' ? 'signup' : 'signin'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmail({ email, password, firstName, lastName, username });
      } else {
        await signInWithEmail({ email, password });
      }
      router.replace('/onboarding/sync');
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      router.replace('/onboarding/sync');
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = [
    styles.input,
    { borderColor: theme.colors.border, borderRadius: theme.spacing.radius.md, color: theme.colors.text },
  ];

  return (
    <ThemedView style={styles.container}>
      <ThemedText variant="h2" style={styles.title}>
        {mode === 'signup' ? 'Đăng ký' : 'Đăng nhập'}
      </ThemedText>

      {mode === 'signup' && (
        <>
          <TextInput
            style={inputStyle}
            placeholder="Username"
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={inputStyle}
            placeholder="Tên"
            placeholderTextColor={theme.colors.textSecondary}
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            style={inputStyle}
            placeholder="Họ"
            placeholderTextColor={theme.colors.textSecondary}
            value={lastName}
            onChangeText={setLastName}
          />
        </>
      )}

      <TextInput
        style={inputStyle}
        placeholder="Email"
        placeholderTextColor={theme.colors.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={inputStyle}
        placeholder="Mật khẩu"
        placeholderTextColor={theme.colors.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && (
        <ThemedText color="error" style={styles.error}>
          {error}
        </ThemedText>
      )}

      <Pressable
        style={[styles.button, { backgroundColor: theme.colors.primary, borderRadius: theme.spacing.radius.md }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>{mode === 'signup' ? 'Đăng ký' : 'Đăng nhập'}</ThemedText>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
        <ThemedText color="primary" style={styles.switchText}>
          {mode === 'signup' ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
        </ThemedText>
      </Pressable>

      <Pressable
        style={[
          styles.googleButton,
          { borderColor: theme.colors.primary, borderRadius: theme.spacing.radius.md },
        ]}
        onPress={handleGoogleSignIn}
        disabled={loading}
      >
        <ThemedText color="primary" style={styles.googleButtonText}>
          Tiếp tục với Google
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { marginBottom: 12 },
  input: { borderWidth: 1, padding: 12 },
  button: { padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: {},
  switchText: { textAlign: 'center', marginTop: 8 },
  googleButton: { borderWidth: 1, padding: 14, alignItems: 'center', marginTop: 8 },
  googleButtonText: { fontWeight: '600' },
});
