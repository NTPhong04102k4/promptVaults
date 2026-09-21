import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import { signOut } from '@/lib/auth';
import { useSessionStore } from '@/store/sessionStore';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemedView, ThemedText } from '@/components/Themed';
import { PromptCard } from '@/components/PromptCard';
import { PromptFormModal } from '@/components/PromptFormModal';
import { getPrompts, savePrompt, deletePrompt, toggleFavorite } from '@/lib/promptRepository';
import type { Prompt } from '@/lib/types';
import type { SavePromptInput } from '@/lib/promptRepository';

const HOME_CATEGORIES = ['Tất cả', 'Video ngắn', 'Mạng xã hội', 'YouTube', 'Email', 'Viết lách', 'Marketing'];

export default function Index() {
  const { theme } = useTheme();
  const session = useSessionStore((s) => s.session);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [copiedToastVisible, setCopiedToastVisible] = useState(false);

  const loadPrompts = useCallback(async () => {
    const list = await getPrompts();
    setPrompts(list);
  }, []);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const filteredPrompts = useMemo(() => {
    return prompts.filter((p) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !query ||
        p.title.toLowerCase().includes(query) ||
        p.content.toLowerCase().includes(query) ||
        (p.tags?.toLowerCase().includes(query) ?? false);
      const matchesCategory = selectedCategory === 'Tất cả' || p.category === selectedCategory;
      const matchesFavorite = !onlyFavorites || p.is_favorite === 1;
      return matchesSearch && matchesCategory && matchesFavorite;
    });
  }, [prompts, searchQuery, selectedCategory, onlyFavorites]);

  function openCreateModal() {
    setEditingPrompt(null);
    setIsModalOpen(true);
  }

  function openEditModal(prompt: Prompt) {
    setEditingPrompt(prompt);
    setIsModalOpen(true);
  }

  async function handleSavePrompt(input: SavePromptInput) {
    await savePrompt(input);
    setIsModalOpen(false);
    setEditingPrompt(null);
    loadPrompts();
  }

  async function handleToggleFavorite(id: string) {
    await toggleFavorite(id);
    loadPrompts();
  }

  function handleDeletePrompt(id: string) {
    Alert.alert('Xoá prompt?', 'Prompt sẽ bị xoá khỏi Kho cá nhân.', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          await deletePrompt(id);
          loadPrompts();
        },
      },
    ]);
  }

  function handleCopied() {
    setCopiedToastVisible(true);
    setTimeout(() => setCopiedToastVisible(false), 2000);
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <ThemedText variant="h2">PromptVault</ThemedText>
        <View style={styles.headerActions}>
          {session ? (
            <Pressable onPress={() => signOut()} hitSlop={8}>
              <Ionicons name="log-out-outline" size={22} color={theme.colors.textSecondary} />
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push('/onboarding/welcome')} hitSlop={8}>
              <Ionicons name="cloud-offline-outline" size={22} color={theme.colors.primary} />
            </Pressable>
          )}
          <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
            <Ionicons name="settings-outline" size={22} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={theme.colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[
            styles.searchInput,
            { borderColor: theme.colors.border, borderRadius: theme.spacing.radius.md, color: theme.colors.text },
          ]}
          placeholder="Tìm kiếm prompt theo tiêu đề, nội dung, tag..."
          placeholderTextColor={theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} style={styles.clearButton} hitSlop={8}>
            <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
          </Pressable>
        )}
      </View>

      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setOnlyFavorites(!onlyFavorites)}
          style={[
            styles.favoriteChip,
            {
              borderColor: onlyFavorites ? theme.colors.warning : theme.colors.border,
              backgroundColor: onlyFavorites ? theme.colors.primaryMuted : 'transparent',
              borderRadius: theme.spacing.radius.full,
            },
          ]}
        >
          <Ionicons
            name={onlyFavorites ? 'star' : 'star-outline'}
            size={14}
            color={onlyFavorites ? theme.colors.warning : theme.colors.textSecondary}
          />
          <ThemedText variant="label" color={onlyFavorites ? 'primary' : 'secondary'}>Yêu thích</ThemedText>
        </Pressable>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={HOME_CATEGORIES}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.categoryRow}
        renderItem={({ item }) => {
          const selected = selectedCategory === item;
          return (
            <Pressable
              onPress={() => setSelectedCategory(item)}
              style={[
                styles.categoryChip,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primaryMuted : 'transparent',
                  borderRadius: theme.spacing.radius.full,
                },
              ]}
            >
              <ThemedText variant="label" color={selected ? 'primary' : 'secondary'}>{item}</ThemedText>
            </Pressable>
          );
        }}
      />

      <FlatList
        data={filteredPrompts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <PromptCard
            prompt={item}
            onToggleFavorite={handleToggleFavorite}
            onEdit={openEditModal}
            onDelete={handleDeletePrompt}
            onCopied={handleCopied}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ThemedText variant="h3" style={styles.emptyTitle}>Không tìm thấy prompt nào</ThemedText>
            <ThemedText color="secondary" style={styles.emptySubtitle}>
              Thử từ khoá khác hoặc tạo một prompt mới.
            </ThemedText>
            <Pressable
              onPress={openCreateModal}
              style={[styles.emptyButton, { backgroundColor: theme.colors.primary, borderRadius: theme.spacing.radius.md }]}
            >
              <ThemedText style={styles.emptyButtonText}>Tạo prompt mới</ThemedText>
            </Pressable>
          </View>
        }
      />

      <Pressable
        onPress={openCreateModal}
        style={[styles.fab, { backgroundColor: theme.colors.primary, borderRadius: theme.spacing.radius.full }]}
      >
        <Ionicons name="add" size={24} color="#fff" />
      </Pressable>

      {copiedToastVisible && (
        <View style={[styles.toast, { backgroundColor: theme.colors.success, borderRadius: theme.spacing.radius.full }]}>
          <Ionicons name="checkmark" size={16} color="#fff" />
          <ThemedText style={styles.toastText}>Đã copy vào bộ nhớ tạm!</ThemedText>
        </View>
      )}

      <View style={[styles.bottomBar, { borderTopColor: theme.colors.border }]}>
        <Pressable onPress={() => setOnlyFavorites(false)} style={styles.bottomBarItem}>
          <Ionicons
            name="folder-outline"
            size={20}
            color={!onlyFavorites ? theme.colors.primary : theme.colors.textSecondary}
          />
          <ThemedText variant="label" color={!onlyFavorites ? 'primary' : 'secondary'}>Kho Vault</ThemedText>
        </Pressable>
        <Pressable onPress={() => setOnlyFavorites(true)} style={styles.bottomBarItem}>
          <Ionicons
            name={onlyFavorites ? 'star' : 'star-outline'}
            size={20}
            color={onlyFavorites ? theme.colors.warning : theme.colors.textSecondary}
          />
          <ThemedText variant="label" color={onlyFavorites ? 'primary' : 'secondary'}>Yêu thích</ThemedText>
        </Pressable>
        <Pressable onPress={() => router.push('/settings')} style={styles.bottomBarItem}>
          <Ionicons name="settings-outline" size={20} color={theme.colors.textSecondary} />
          <ThemedText variant="label" color="secondary">Cài đặt</ThemedText>
        </Pressable>
      </View>

      {isModalOpen && (
        <PromptFormModal
          prompt={editingPrompt}
          onSave={handleSavePrompt}
          onClose={() => {
            setIsModalOpen(false);
            setEditingPrompt(null);
          }}
        />
      )}
    </ThemedView>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  searchRow: { paddingHorizontal: 16, paddingTop: 12, position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 28, top: 24, zIndex: 1 },
  searchInput: { borderWidth: 1, paddingVertical: 10, paddingLeft: 36, paddingRight: 36, fontSize: 14 },
  clearButton: { position: 'absolute', right: 28, top: 22 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12 },
  favoriteChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14 },
  categoryRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  categoryChip: { borderWidth: 1, paddingVertical: 6, paddingHorizontal: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 96, gap: 12 },
  emptyState: { alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { textAlign: 'center' },
  emptySubtitle: { textAlign: 'center' },
  emptyButton: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 20 },
  emptyButtonText: { color: '#fff', fontWeight: '600' },
  fab: { position: 'absolute', bottom: 88, right: 20, width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  toast: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  toastText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingVertical: 8,
  },
  bottomBarItem: { alignItems: 'center', gap: 2 },
});
