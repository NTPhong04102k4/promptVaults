import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { ThemedText } from '@/components/Themed'
import { Button } from '@/components/ui'
import { adoptLocalPrompts, countLocalPrompts, prepareSignedInUser } from '@/lib/accountData'
import type { Space } from '@/lib/spaces'
import { runSync } from '@/lib/syncEngine'
import { replace, resetTo } from '@/navigation'
import { useAuthStore } from '@/store'
import { makeStyles, useTheme } from '@/theme'

type Phase = 'loading' | 'ask' | 'working' | 'done' | 'error'

// Shown after every sign-in and from Settings → "Sao lưu & đồng bộ" (spec §10.3).
export default function SyncScreen() {
  const styles = useStyles()
  const { colors } = useTheme()
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const email = useAuthStore((state) => state.user?.email ?? null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [localCount, setLocalCount] = useState(0)
  const [personal, setPersonal] = useState<Space | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      replace('login')
      return
    }
    let active = true
    ;(async () => {
      try {
        const space = await prepareSignedInUser(userId)
        const count = await countLocalPrompts()
        if (!active) return
        setPersonal(space)
        setLocalCount(count)
        if (count === 0 || !space) {
          runSync().catch(() => undefined)
          resetTo('home')
          return
        }
        setPhase('ask')
      } catch {
        if (!active) return
        setMessage('Không kết nối được máy chủ. Prompt vẫn được lưu trên máy này.')
        setPhase('error')
      }
    })()
    return () => {
      active = false
    }
  }, [userId])

  async function handleAdopt() {
    if (!personal) return
    setPhase('working')
    const adopted = await adoptLocalPrompts(personal.id)
    const summary = await runSync()
    setMessage(
      summary.errors > 0
        ? `Đã chuyển ${adopted} prompt vào Kho cá nhân. Sẽ tải lên khi có mạng.`
        : `Đã đưa ${adopted} prompt lên Kho cá nhân.`,
    )
    setPhase('done')
  }

  function handleLater() {
    runSync().catch(() => undefined)
    resetTo('home')
  }

  if (phase === 'loading' || phase === 'working') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {phase === 'ask' && (
        <>
          <ThemedText variant="titleLarge" style={styles.center}>
            Đồng bộ prompt trên máy này?
          </ThemedText>
          <ThemedText color="secondary" style={styles.center}>
            Đưa {localCount} prompt trên máy này vào Kho cá nhân của {email ?? 'tài khoản'} để dùng trên
            mọi thiết bị.
          </ThemedText>
          <Button label="Đưa lên" onPress={handleAdopt} />
        </>
      )}

      {(phase === 'done' || phase === 'error') && message && (
        <ThemedText color={phase === 'error' ? 'error' : 'primary'} style={styles.center}>
          {message}
        </ThemedText>
      )}

      <Pressable onPress={phase === 'ask' ? handleLater : () => resetTo('home')}>
        <ThemedText color="primary" style={styles.center}>
          {phase === 'ask' ? 'Để sau' : 'Về trang chủ'}
        </ThemedText>
      </Pressable>
    </View>
  )
}

const useStyles = makeStyles(({ spacing }) => ({
  container: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  center: { textAlign: 'center' },
}))
