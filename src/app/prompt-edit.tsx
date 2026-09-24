import { useEffect, useState } from 'react'
import { ScrollView, Text, TextInput, View } from 'react-native'

import { Icon } from '@/components/Icon'
import { Button, FilterChip, IconButton, TextField } from '@/components/ui'
import { PERSONAL_VAULT_ID } from '@/lib/db'
import { createPrompt, getPrompt, PROMPT_CATEGORIES, updatePrompt } from '@/lib/prompts'
import { goBack, useRouteParams } from '@/navigation'
import { makeStyles, text, useTheme } from '@/theme'

export default function PromptEditScreen() {
  const styles = useStyles()
  const { colors } = useTheme()
  const { id } = useRouteParams('promptEdit')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    getPrompt(id).then((prompt) => {
      if (!prompt) return
      setTitle(prompt.title)
      setContent(prompt.content)
      setCategory(prompt.category)
    })
  }, [id])

  const canSave = title.trim().length > 0 && content.trim().length > 0

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      if (id) {
        await updatePrompt(id, { title: title.trim(), content: content.trim(), category })
      } else {
        await createPrompt({
          vaultId: PERSONAL_VAULT_ID,
          title: title.trim(),
          content: content.trim(),
          category,
        })
      }
      goBack('home')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.container}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{id ? 'Sửa prompt' : 'Prompt mới'}</Text>
        <IconButton name="close" accessibilityLabel="Đóng" onPress={() => goBack('home')} />
      </View>

      <TextField
        label="Tiêu đề"
        placeholder="VD: Viết caption Instagram"
        value={title}
        onChangeText={setTitle}
      />

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Nội dung</Text>
        <TextInput
          style={styles.textarea}
          multiline
          numberOfLines={4}
          placeholder="Nhập nội dung prompt đầy đủ ở đây…"
          placeholderTextColor={colors.outline}
          value={content}
          onChangeText={setContent}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Danh mục</Text>
        <View style={styles.chips}>
          {PROMPT_CATEGORIES.map((option) => (
            <FilterChip
              key={option}
              label={option}
              selected={category === option}
              onPress={() => setCategory(category === option ? null : option)}
            />
          ))}
        </View>
      </View>

      <Button
        label="Lưu prompt"
        icon={<Icon name="check" size={20} color={colors.onPrimary} />}
        onPress={handleSave}
        disabled={!canSave}
        loading={saving}
      />
    </ScrollView>
  )
}

const useStyles = makeStyles(({ colors, typography, shape, spacing }) => ({
  container: { backgroundColor: colors.surface },
  content: { padding: spacing.lg, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...text('headlineSmall'), color: colors.onSurface },
  field: { gap: spacing.sm },
  fieldLabel: { ...text('labelMedium', 'medium'), color: colors.onSurface },
  textarea: {
    minHeight: 96,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: shape.small,
    backgroundColor: colors.surfaceContainerLowest,
    textAlignVertical: 'top',
    ...typography.bodyLarge,
    color: colors.onSurface,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
}))
