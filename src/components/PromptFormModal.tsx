import { useState } from 'react';
import { Modal, View, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemedView, ThemedText } from '@/components/Themed';
import type { Prompt } from '@/lib/types';
import type { SavePromptInput } from '@/lib/promptRepository';

const CATEGORIES = [
  'Video ngắn',
  'Mạng xã hội',
  'YouTube',
  'Email',
  'Viết lách',
  'Marketing',
  'Ý tưởng',
  'Khác',
];

type PromptFormModalProps = {
  prompt: Prompt | null;
  onSave: (input: SavePromptInput) => void;
  onClose: () => void;
};

export function PromptFormModal({ prompt, onSave, onClose }: PromptFormModalProps) {
  const { theme } = useTheme();
  const [title, setTitle] = useState(prompt?.title ?? '');
  const [content, setContent] = useState(prompt?.content ?? '');
  const [category, setCategory] = useState(prompt?.category ?? CATEGORIES[0]);
  const [tags, setTags] = useState(prompt?.tags ?? '');
  const [isFavorite, setIsFavorite] = useState(prompt?.is_favorite ?? 0);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!title.trim() || !content.trim()) {
      setError('Tiêu đề và nội dung prompt không được để trống.');
      return;
    }
    onSave({
      id: prompt?.id,
      vault_id: prompt?.vault_id,
      title: title.trim(),
      content: content.trim(),
      category: category || null,
      tags: tags.trim() || null,
      is_favorite: isFavorite,
    });
  }

  const inputStyle = [
    styles.input,
    {
      borderColor: theme.colors.border,
      borderRadius: theme.spacing.radius.md,
      color: theme.colors.text,
      backgroundColor: theme.colors.surface,
    },
  ];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={styles.container}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <ThemedText variant="h3">{prompt ? 'Chỉnh sửa prompt' : 'Tạo prompt mới'}</ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {error && (
            <ThemedText color="error" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <View style={styles.field}>
            <ThemedText variant="label" color="secondary">Tiêu đề prompt *</ThemedText>
            <TextInput
              style={inputStyle}
              placeholder="VD: Hook 3 giây mở đầu video TikTok"
              placeholderTextColor={theme.colors.textSecondary}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" color="secondary">Danh mục</ThemedText>
            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => {
                const selected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: selected ? theme.colors.primaryMuted : 'transparent',
                        borderRadius: theme.spacing.radius.md,
                      },
                    ]}
                  >
                    <ThemedText variant="caption" color={selected ? 'primary' : undefined}>{cat}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" color="secondary">Thẻ hashtag (phân cách bằng dấu phẩy)</ThemedText>
            <TextInput
              style={inputStyle}
              placeholder="hook, tiktok, viral"
              placeholderTextColor={theme.colors.textSecondary}
              value={tags}
              onChangeText={setTags}
            />
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" color="secondary">Nội dung prompt *</ThemedText>
            <TextInput
              style={[inputStyle, styles.textarea]}
              placeholder="Nhập nội dung prompt chi tiết tại đây..."
              placeholderTextColor={theme.colors.textSecondary}
              value={content}
              onChangeText={setContent}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <Pressable
            onPress={() => setIsFavorite(isFavorite === 1 ? 0 : 1)}
            style={[
              styles.favoriteButton,
              {
                borderColor: isFavorite === 1 ? theme.colors.warning : theme.colors.border,
                backgroundColor: isFavorite === 1 ? theme.colors.primaryMuted : 'transparent',
                borderRadius: theme.spacing.radius.md,
              },
            ]}
          >
            <Ionicons
              name={isFavorite === 1 ? 'star' : 'star-outline'}
              size={18}
              color={isFavorite === 1 ? theme.colors.warning : theme.colors.textSecondary}
            />
          </Pressable>

          <View style={styles.footerActions}>
            <Pressable
              onPress={onClose}
              style={[styles.cancelButton, { borderColor: theme.colors.border, borderRadius: theme.spacing.radius.md }]}
            >
              <ThemedText color="secondary">Huỷ</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              style={[styles.saveButton, { backgroundColor: theme.colors.primary, borderRadius: theme.spacing.radius.md }]}
            >
              <ThemedText style={styles.saveButtonText}>Lưu prompt</ThemedText>
            </Pressable>
          </View>
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  body: { padding: 16, gap: 16 },
  field: { gap: 6 },
  input: { borderWidth: 1, padding: 12, fontSize: 14 },
  textarea: { minHeight: 120 },
  error: { padding: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingVertical: 6, paddingHorizontal: 12 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
  },
  favoriteButton: { borderWidth: 1, padding: 10 },
  footerActions: { flexDirection: 'row', gap: 8 },
  cancelButton: { borderWidth: 1, paddingVertical: 10, paddingHorizontal: 16 },
  saveButton: { paddingVertical: 10, paddingHorizontal: 16 },
  saveButtonText: { color: '#fff', fontWeight: '600' },
});
