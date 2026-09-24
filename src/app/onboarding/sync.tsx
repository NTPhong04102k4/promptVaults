import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { ThemedText } from '@/components/Themed'
import { pullCloudPromptsToLocal, pushLocalPromptsToCloud } from '@/lib/sync'
import { resetTo } from '@/navigation'
import { makeStyles, useTheme } from '@/theme'

export default function SyncScreen() {
  const styles = useStyles()
  const { colors } = useTheme()
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done'>('idle')
  const [result, setResult] = useState<{ synced: number; failed: number; pulled: number } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setError(null)
    setResult(null)
    setStatus('syncing')
    try {
      const pullResult = await pullCloudPromptsToLocal()
      const pushResult = await pushLocalPromptsToCloud()
      setResult({ ...pushResult, pulled: pullResult.pulled })
      setStatus('done')
    } catch {
      setError('Đồng bộ thất bại, thử lại sau.')
      setStatus('idle')
    }
  }

  return (
    <View style={styles.container}>
      <ThemedText variant="titleLarge" style={styles.title}>
        Đồng bộ dữ liệu?
      </ThemedText>
      <ThemedText color="secondary" style={styles.subtitle}>
        Đồng bộ prompt giữa máy này và tài khoản của bạn — đẩy prompt mới trên máy lên, và tải về
        prompt đã lưu từ thiết bị khác.
      </ThemedText>

      {error && (
        <ThemedText color="error" style={styles.resultText}>
          {error}
        </ThemedText>
      )}

      {status === 'done' && result && (
        <ThemedText color="primary" style={styles.resultText}>
          Đã gửi {result.synced} prompt{result.failed > 0 ? `, ${result.failed} lỗi` : ''}, tải về{' '}
          {result.pulled} prompt.
        </ThemedText>
      )}

      <Pressable style={styles.primaryButton} onPress={handleSync} disabled={status === 'syncing'}>
        {status === 'syncing' ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <ThemedText style={{ color: colors.onPrimary, fontWeight: '600' }}>Đồng bộ ngay</ThemedText>
        )}
      </Pressable>

      <Pressable onPress={() => resetTo('home')}>
        <ThemedText color="primary" style={styles.secondaryText}>
          Để sau
        </ThemedText>
      </Pressable>
    </View>
  )
}

const useStyles = makeStyles(({ colors, shape, spacing }) => ({
  container: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center' },
  resultText: { textAlign: 'center' },
  primaryButton: {
    padding: 14,
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: shape.medium,
  },
  secondaryText: { textAlign: 'center', marginTop: spacing.sm },
}))
