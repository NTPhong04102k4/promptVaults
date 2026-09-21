import { useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemedView, ThemedText } from '@/components/Themed';
import type { Prompt } from '@/lib/types';

type PromptCardProps = {
  prompt: Prompt;
  onToggleFavorite: (id: string) => void;
  onEdit: (prompt: Prompt) => void;
  onDelete: (id: string) => void;
  onCopied: () => void;
};

export function PromptCard({ prompt, onToggleFavorite, onEdit, onDelete, onCopied }: PromptCardProps) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const isMountedRef = useRef(true);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  async function handleCopy() {
    await Clipboard.setStringAsync(prompt.content);
    if (!isMountedRef.current) return;
    setCopied(true);
    onCopied();
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) setCopied(false);
    }, 2000);
  }

  return (
    <ThemedView
      variant="surface"
      style={[styles.card, { borderColor: theme.colors.border, borderRadius: theme.spacing.radius.lg }]}
    >
      <View style={styles.headerRow}>
        <View style={styles.badges}>
          {prompt.category && (
            <View style={[styles.badge, { backgroundColor: theme.colors.primaryMuted, borderRadius: theme.spacing.radius.sm }]}>
              <ThemedText variant="label" color="primary">{prompt.category}</ThemedText>
            </View>
          )}
          <View style={[styles.badge, styles.outlinedBadge, { borderColor: theme.colors.border }]}>
            <Ionicons
              name={prompt.synced_at ? 'cloud-outline' : 'cloud-offline-outline'}
              size={12}
              color={theme.colors.textSecondary}
            />
            <ThemedText variant="label" color="secondary">{prompt.synced_at ? 'Cloud' : 'Local'}</ThemedText>
          </View>
        </View>

        <Pressable onPress={() => onToggleFavorite(prompt.id)} hitSlop={8}>
          <Ionicons
            name={prompt.is_favorite === 1 ? 'star' : 'star-outline'}
            size={20}
            color={prompt.is_favorite === 1 ? theme.colors.warning : theme.colors.textSecondary}
          />
        </Pressable>
      </View>

      <ThemedText variant="bodyMedium" numberOfLines={1}>
        {prompt.title}
      </ThemedText>

      <ThemedView
        style={[styles.contentBox, { borderColor: theme.colors.border, borderRadius: theme.spacing.radius.md }]}
      >
        <ThemedText variant="caption" color="secondary" numberOfLines={4}>
          {prompt.content}
        </ThemedText>
      </ThemedView>

      {prompt.tags && (
        <View style={styles.tagsRow}>
          <Ionicons name="pricetag-outline" size={12} color={theme.colors.textSecondary} />
          <ThemedText variant="caption" color="secondary" numberOfLines={1}>
            {prompt.tags}
          </ThemedText>
        </View>
      )}

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <View style={styles.footerActions}>
          <Pressable onPress={() => onEdit(prompt)} hitSlop={8} style={styles.iconButton}>
            <Ionicons name="create-outline" size={18} color={theme.colors.textSecondary} />
          </Pressable>
          <Pressable onPress={() => onDelete(prompt.id)} hitSlop={8} style={styles.iconButton}>
            <Ionicons name="trash-outline" size={18} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        <Pressable
          onPress={handleCopy}
          style={[
            styles.copyButton,
            {
              backgroundColor: copied ? theme.colors.success : theme.colors.primary,
              borderRadius: theme.spacing.radius.md,
            },
          ]}
        >
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color="#fff" />
          <ThemedText style={styles.copyButtonText}>{copied ? 'Đã copy!' : 'Copy 1 chạm'}</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 16, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6 },
  outlinedBadge: { borderWidth: 1 },
  contentBox: { borderWidth: 1, padding: 10, maxHeight: 100 },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  footerActions: { flexDirection: 'row', gap: 4 },
  iconButton: { padding: 6 },
  copyButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14 },
  copyButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
});
