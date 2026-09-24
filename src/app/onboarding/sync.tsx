import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { pullCloudPromptsToLocal, pushLocalPromptsToCloud } from '@/lib/sync'
import { resetTo } from '@/navigation'

export default function SyncScreen() {
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
      <Text style={styles.title}>Đồng bộ dữ liệu?</Text>
      <Text style={styles.subtitle}>
        Đồng bộ prompt giữa máy này và tài khoản của bạn — đẩy prompt mới trên máy lên, và tải về
        prompt đã lưu từ thiết bị khác.
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {status === 'done' && result && (
        <Text style={styles.resultText}>
          Đã gửi {result.synced} prompt{result.failed > 0 ? `, ${result.failed} lỗi` : ''}, tải về{' '}
          {result.pulled} prompt.
        </Text>
      )}

      <Pressable style={styles.primaryButton} onPress={handleSync} disabled={status === 'syncing'}>
        {status === 'syncing' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Đồng bộ ngay</Text>
        )}
      </Pressable>

      <Pressable onPress={() => resetTo('home')}>
        <Text style={styles.secondaryText}>Để sau</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#555' },
  error: { color: '#D14343', textAlign: 'center' },
  resultText: { textAlign: 'center', color: '#208AEF' },
  primaryButton: { backgroundColor: '#208AEF', borderRadius: 8, padding: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  secondaryText: { color: '#208AEF', textAlign: 'center', marginTop: 8 },
})
