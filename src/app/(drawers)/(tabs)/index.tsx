import { FlatList, Pressable, Text, View } from 'react-native'

import { Icon } from '@/components/Icon'
import { FilterChip, PromptCard, SearchBar } from '@/components/ui'
import { usePrompts } from '@/hooks/usePrompts'
import { useResponsive } from '@/hooks/useResponsive'
import { PROMPT_CATEGORIES } from '@/lib/prompts'
import { push } from '@/navigation'
import { makeStyles, text, useTheme } from '@/theme'

export default function HomeScreen() {
  const styles = useStyles()
  const { select } = useResponsive()
  const { prompts, category, setCategory, toggleFavorite, copyToClipboard } = usePrompts()

  return (
    <View style={styles.container}>
      <FlatList
        data={prompts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingHorizontal: select({ compact: 16, medium: 24, expanded: 32 }) },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar
              value=""
              placeholder="Tìm prompt, tag, danh mục…"
              editable={false}
              onPress={() => push('search')}
            />
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={['Tất cả', ...PROMPT_CATEGORIES]}
              keyExtractor={(item) => item}
              contentContainerStyle={styles.chips}
              renderItem={({ item }) => (
                <FilterChip
                  label={item}
                  selected={item === 'Tất cả' ? category === null : category === item}
                  onPress={() => setCategory(item === 'Tất cả' ? null : item)}
                />
              )}
            />
          </View>
        }
        renderItem={({ item }) => (
          <PromptCard
            title={item.title}
            snippet={item.content}
            category={item.category}
            isFavorite={item.isFavorite}
            onPress={() => push('promptDetail', { id: item.id })}
            onToggleFavorite={() => toggleFavorite(item.id)}
            onCopy={() => copyToClipboard(item.id)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<Text style={styles.empty}>Chưa có prompt nào.</Text>}
      />

      <View style={styles.fab}>
        <FabButton onPress={() => push('promptEdit')} />
      </View>
    </View>
  )
}

function FabButton({ onPress }: { onPress: () => void }) {
  const styles = useStyles()
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Prompt mới"
      onPress={onPress}
      style={styles.fabButton}
    >
      <Icon name="add" size={20} color={colors.onPrimaryContainer} />
      <Text style={styles.fabLabel}>Prompt mới</Text>
    </Pressable>
  )
}

const useStyles = makeStyles(({ colors, shape, spacing }) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl * 2, gap: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.md },
  chips: { gap: spacing.sm },
  separator: { height: spacing.md },
  empty: { ...text('bodyLarge'), color: colors.onSurfaceVariant, textAlign: 'center' },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.xl },
  fabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: shape.largeIncreased,
    backgroundColor: colors.primaryContainer,
    elevation: 3,
  },
  fabLabel: { ...text('labelLarge', 'medium'), color: colors.onPrimaryContainer },
}))
