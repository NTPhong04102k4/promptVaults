import { useCallback, useState } from 'react'
import { Alert, FlatList, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'

import { Button } from '@/components/ui'
import { toAuthError } from '@/lib/authForm'
import { describeSession, type DeviceSession, listSessions, revokeSession } from '@/lib/sessions'
import { makeStyles, text } from '@/theme'

export default function SessionsScreen() {
  const styles = useStyles()
  const [sessions, setSessions] = useState<DeviceSession[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    listSessions()
      .then((list) => {
        setSessions(list)
        setError(null)
      })
      .catch((e) => setError(toAuthError(e).message))
  }, [])

  useFocusEffect(load)

  function confirmRevoke(session: DeviceSession) {
    Alert.alert('Đăng xuất thiết bị?', describeSession(session).title, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeSession(session.id)
            load()
          } catch (e) {
            Alert.alert('Không đăng xuất được', toAuthError(e).message)
          }
        },
      },
    ])
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={sessions}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      // Access sessions are not revoked on refresh, so a device can appear twice (gap G7).
      renderItem={({ item }) => {
        const { title, subtitle } = describeSession(item)
        return (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.title}>
                {title}
                {item.isCurrent ? ' · Thiết bị này' : ''}
              </Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            {!item.isCurrent && (
              <Button variant="tonal" label="Đăng xuất" onPress={() => confirmRevoke(item)} />
            )}
          </View>
        )
      }}
    />
  )
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  list: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xxs },
  title: { ...text('titleMedium', 'medium'), color: colors.onSurface },
  subtitle: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
  error: { ...typography.bodySmall, color: colors.error },
}))
