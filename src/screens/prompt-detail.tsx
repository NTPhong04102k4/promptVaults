import { useCallback, useState } from 'react'
import { Alert, ScrollView, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Icon } from '@/components/Icon'
import { Button, IconButton } from '@/components/ui'
import { formatRelativeTime } from '@/lib/format'
import { deletePrompt, getPrompt, type Prompt, recordCopy, setFavorite } from '@/lib/prompts'
import { goBack, push, useRouteParams } from '@/navigation'
import { makeStyles, text, useTheme } from '@/theme'

export default function PromptDetailScreen() {
  const styles = useStyles()
  const { colors } = useTheme()
  const { id } = useRouteParams('promptDetail')
  const [prompt, setPrompt] = useState<Prompt | null>(null)

  const load = useCallback(() => {
    getPrompt(id).then(setPrompt)
  }, [id])

  useFocusEffect(load)

  async function handleToggleFavorite() {
    if (!prompt) return
    await setFavorite(prompt.id, !prompt.isFavorite)
    load()
  }

  async function handleCopy() {
    if (!prompt) return
    await Clipboard.setStringAsync(prompt.content)
    const copyCount = await recordCopy(prompt.id)
    setPrompt({ ...prompt, copyCount })
  }

  function handleDelete() {
    if (!prompt) return
    Alert.alert('Xoá prompt?', 'Hành động này không thể hoàn tác.', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          await deletePrompt(prompt.id)
          goBack('home')
        },
      },
    ])
  }

  if (!prompt) return <SafeAreaView style={styles.safe} />

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton name="close" accessibilityLabel="Đóng" onPress={() => goBack('home')} />
        <Text style={styles.topTitle}>Chi tiết prompt</Text>
        <View style={styles.actions}>
          <IconButton
            name={prompt.isFavorite ? 'favoriteFilled' : 'favorite'}
            accessibilityLabel={prompt.isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}
            onPress={handleToggleFavorite}
          />
          <IconButton
            name="edit"
            accessibilityLabel="Sửa prompt"
            onPress={() => push('promptEdit', { id: prompt.id })}
          />
          <IconButton
            name="delete"
            accessibilityLabel="Xoá prompt"
            color={colors.error}
            onPress={handleDelete}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>{prompt.title}</Text>

          {prompt.category && (
            <View style={styles.categoryTag}>
              <Text style={styles.categoryLabel}>{prompt.category}</Text>
            </View>
          )}

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>NỘI DUNG PROMPT</Text>
          <Text style={styles.promptContent}>{prompt.content}</Text>

          <Text style={styles.meta}>
            Cập nhật {formatRelativeTime(prompt.updatedAt)} · Đã copy {prompt.copyCount} lần
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Copy nội dung"
          icon={<Icon name="copy" size={20} color={colors.onPrimary} />}
          onPress={handleCopy}
        />
      </View>
    </SafeAreaView>
  )
}

const useStyles = makeStyles(({ colors, shape, spacing }) => ({
  safe: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topTitle: { flex: 1, ...text('headlineSmall'), color: colors.onSurface },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  content: { padding: spacing.lg },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: shape.large,
    backgroundColor: colors.surfaceContainer,
  },
  title: { ...text('headlineSmall'), color: colors.onSurface },
  categoryTag: {
    alignSelf: 'flex-start',
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: shape.small,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  categoryLabel: { ...text('labelLarge', 'medium'), color: colors.onSurfaceVariant },
  divider: { height: 1, backgroundColor: colors.outlineVariant },
  sectionLabel: { ...text('labelMedium', 'medium'), color: colors.onSurfaceVariant },
  promptContent: { ...text('bodyLarge'), color: colors.onSurface },
  meta: { ...text('bodySmall'), color: colors.onSurfaceVariant },
  footer: { padding: spacing.lg },
}))
