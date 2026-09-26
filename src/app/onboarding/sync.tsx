import { useState } from 'react';
import { Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { pushLocalPromptsToCloud, pullCloudPromptsToLocal } from '@/lib/sync';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemedView, ThemedText } from '@/components/Themed';

export default function SyncScreen() {
  const { theme } = useTheme();
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done'>('idle');
  const [result, setResult] = useState<{ synced: number; failed: number; pulled: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setError(null);
    setResult(null);
    setStatus('syncing');
    try {
      const pullResult = await pullCloudPromptsToLocal();
      const pushResult = await pushLocalPromptsToCloud();
      setResult({ ...pushResult, pulled: pullResult.pulled });
      setStatus('done');
    } catch {
      setError('Đồng bộ thất bại, thử lại sau.');
      setStatus('idle');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText variant="h2" style={styles.title}>
        Đồng bộ dữ liệu?
      </ThemedText>
      <ThemedText color="secondary" style={styles.subtitle}>
        Đồng bộ prompt giữa máy này và tài khoản của bạn — đẩy prompt mới trên máy lên, và tải về prompt đã lưu từ thiết bị khác.
      </ThemedText>

      {error && (
        <ThemedText color="error" style={styles.error}>
          {error}
        </ThemedText>
      )}

      {status === 'done' && result && (
        <ThemedText color="primary" style={styles.resultText}>
          Đã gửi {result.synced} prompt{result.failed > 0 ? `, ${result.failed} lỗi` : ''}, tải về {result.pulled} prompt.
        </ThemedText>
      )}

      <Pressable
        style={[styles.primaryButton, { backgroundColor: theme.colors.primary, borderRadius: theme.spacing.radius.md }]}
        onPress={handleSync}
        disabled={status === 'syncing'}
      >
        {status === 'syncing' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.primaryButtonText}>Đồng bộ ngay</ThemedText>
        )}
      </Pressable>

      <Pressable onPress={() => router.replace('/')}>
        <ThemedText color="primary" style={styles.secondaryText}>
          Để sau
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center' },
  error: { textAlign: 'center' },
  resultText: { textAlign: 'center' },
  primaryButton: { padding: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  secondaryText: { textAlign: 'center', marginTop: 8 },
});
