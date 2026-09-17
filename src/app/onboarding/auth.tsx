import { useState } from 'react';
import { View, TextInput, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from '@/lib/auth';

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{mode === 'signup' ? 'Đăng ký' : 'Đăng nhập'}</Text>

      {mode === 'signup' && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Username"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={styles.input}
            placeholder="Tên"
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            style={styles.input}
            placeholder="Họ"
            value={lastName}
            onChangeText={setLastName}
          />
        </>
      )}

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mật khẩu"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{mode === 'signup' ? 'Đăng ký' : 'Đăng nhập'}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
        <Text style={styles.switchText}>
          {mode === 'signup' ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
        </Text>
      </Pressable>

      <Pressable style={styles.googleButton} onPress={handleGoogleSignIn} disabled={loading}>
        <Text style={styles.googleButtonText}>Tiếp tục với Google</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  button: { backgroundColor: '#208AEF', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D14343' },
  switchText: { color: '#208AEF', textAlign: 'center', marginTop: 8 },
  googleButton: { borderWidth: 1, borderColor: '#208AEF', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  googleButtonText: { color: '#208AEF', fontWeight: '600' },
});
