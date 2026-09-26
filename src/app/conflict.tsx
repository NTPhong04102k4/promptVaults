import { useCallback, useState } from 'react'
import { Alert, ScrollView, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button, IconButton, TextField } from '@/components/ui'
import { useResponsive } from '@/hooks/useResponsive'
import { runResolution, visibleResolutionButtons } from '@/lib/conflictResolution'
import {
  type ConflictRecord,
  getConflictForPrompt,
  getLocalVersion,
  type LocalVersion,
  resolveKeepLocal,
  resolveKeepRemote,
  resolveMerged,
  type ResolveOutcome,
} from '@/lib/conflicts'
import { goBack, useRouteParams } from '@/navigation'
import { makeStyles, text, useTheme } from '@/theme'

export default function ConflictScreen() {
  const styles = useStyles()
  const { colors } = useTheme()
  const { promptId } = useRouteParams('conflict')
  const [conflict, setConflict] = useState<ConflictRecord | null>(null)
  const [local, setLocal] = useState<LocalVersion | null>(null)
  const [merging, setMerging] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const { isCompact } = useResponsive()

  const refetch = useCallback(async () => {
    const [nextConflict, nextLocal] = await Promise.all([
      getConflictForPrompt(promptId),
      getLocalVersion(promptId),
    ])
    setConflict(nextConflict)
    setLocal(nextLocal)
  }, [promptId])

  useFocusEffect(
    useCallback(() => {
      refetch()
    }, [refetch]),
  )

  async function run(action: () => Promise<ResolveOutcome>) {
    setBusy(true)
    const result = await runResolution(action, refetch)
    setBusy(false)
    switch (result.kind) {
      case 'forbidden':
        setForbidden(true)
        setMerging(false)
        Alert.alert(
          'Không có quyền sửa',
          'Bạn chỉ có thể giữ bản trên máy chủ vì prompt này do thành viên khác tạo.',
        )
        return
      case 'requeued':
        Alert.alert(
          'Bản trên máy chủ vừa thay đổi',
          'Lựa chọn của bạn sẽ được đồng bộ lại. Nếu vẫn khác, bạn sẽ được hỏi lại.',
        )
        setMerging(false)
        return
      case 'error':
        Alert.alert('Chưa giải quyết được', result.message)
        return
      case 'success':
        goBack('home')
    }
  }

  function startMerge() {
    setTitle(local?.title ?? conflict?.remote.title ?? '')
    setContent(local?.content ?? conflict?.remote.content ?? '')
    setMerging(true)
  }

  if (!conflict) return <SafeAreaView style={styles.safe} />

  const deletedLocally = local === null
  const deletedRemotely = conflict.remote.isDeleted
  const buttons = visibleResolutionButtons({ deletedLocally, forbidden })

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton name="close" accessibilityLabel="Đóng" onPress={() => goBack('home')} />
        <Text style={styles.topTitle}>Xung đột đồng bộ</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {merging ? (
          <>
            <TextField label="Tiêu đề" value={title} onChangeText={setTitle} />
            <TextInput
              style={[styles.textarea, { color: colors.onSurface }]}
              multiline
              value={content}
              onChangeText={setContent}
            />
            <Button
              label="Lưu bản gộp"
              loading={busy}
              disabled={!title.trim() || !content.trim()}
              onPress={() =>
                run(() =>
                  resolveMerged(conflict, {
                    title: title.trim(),
                    content: content.trim(),
                    category: local?.category ?? null,
                  }),
                )
              }
            />
          </>
        ) : (
          <>
            <View style={isCompact ? styles.stack : styles.columns}>
              <View style={styles.panel}>
                <Text style={styles.panelLabel}>Bản của bạn</Text>
                {deletedLocally ? (
                  <Text style={styles.body}>Bạn đã xoá prompt này.</Text>
                ) : (
                  <>
                    <Text style={styles.panelTitle}>{local.title}</Text>
                    <Text style={styles.body}>{local.content}</Text>
                  </>
                )}
              </View>
              <View style={styles.panel}>
                <Text style={styles.panelLabel}>Bản trên máy chủ</Text>
                {deletedRemotely ? (
                  <Text style={styles.body}>Prompt đã bị xoá trên thiết bị khác.</Text>
                ) : (
                  <>
                    <Text style={styles.panelTitle}>{conflict.remote.title}</Text>
                    <Text style={styles.body}>{conflict.remote.content}</Text>
                  </>
                )}
              </View>
            </View>

            {forbidden && (
              <Text style={styles.forbiddenNote}>
                Bạn chỉ có thể giữ bản trên máy chủ cho prompt này.
              </Text>
            )}

            {buttons.keepLocal && (
              <Button
                label={deletedLocally ? 'Vẫn xoá' : 'Giữ bản của tôi'}
                loading={busy}
                onPress={() => run(() => resolveKeepLocal(conflict))}
              />
            )}
            {buttons.keepRemote && (
              <Button
                variant="tonal"
                label={
                  deletedLocally ? 'Khôi phục bản máy chủ' : deletedRemotely ? 'Chấp nhận xoá' : 'Giữ bản máy chủ'
                }
                loading={busy}
                onPress={() => run(() => resolveKeepRemote(conflict))}
              />
            )}
            {buttons.merge && (
              <Button variant="tonal" label="Gộp" disabled={busy} onPress={startMerge} />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const useStyles = makeStyles(({ colors, typography, shape, spacing }) => ({
  safe: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  topTitle: { ...text('titleLarge'), color: colors.onSurface },
  content: { padding: spacing.lg, gap: spacing.lg },
  columns: { flexDirection: 'row', gap: spacing.md },
  stack: { gap: spacing.md },
  panel: {
    flex: 1,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: shape.medium,
    backgroundColor: colors.surfaceContainerLowest,
  },
  panelLabel: { ...text('labelMedium', 'medium'), color: colors.primary },
  panelTitle: { ...text('titleMedium', 'semiBold'), color: colors.onSurface },
  body: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
  forbiddenNote: { ...text('bodySmall'), color: colors.error },
  textarea: {
    minHeight: 160,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: shape.small,
    textAlignVertical: 'top',
    ...typography.bodyLarge,
  },
}))
