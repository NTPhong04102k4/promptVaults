import { useCallback } from 'react'
import { FlatList, Text, View } from 'react-native'

import { FilterChip, PromptCard, SearchBar } from '@/components/ui'
import { usePrompts } from '@/hooks/usePrompts'
import { useResponsive } from '@/hooks/useResponsive'
import { PROMPT_CATEGORIES } from '@/lib/prompts'
import { push } from '@/navigation'
import { makeStyles, text } from '@/theme'

export default function SearchScreen() {
  const styles = useStyles()
  const { select } = useResponsive()
  const { prompts, category, setCategory, query, setQuery, toggleFavorite, copyToClipboard } =
    usePrompts()
  // Stable handler so PromptCard's React.memo isn't defeated by a new closure per render.
  const handlePress = useCallback((id: string) => push('promptDetail', { id }), [])

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
              value={query}
              onChangeText={setQuery}
              placeholder="Tìm prompt, tag, danh mục…"
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
            id={item.id}
            title={item.title}
            snippet={item.content}
            category={item.category}
            isFavorite={item.isFavorite}
            onPress={handlePress}
            onToggleFavorite={toggleFavorite}
            onCopy={copyToClipboard}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query ? 'Không tìm thấy prompt phù hợp.' : 'Nhập từ khoá để tìm prompt.'}
          </Text>
        }
      />
    </View>
  )
}

const useStyles = makeStyles(({ colors, spacing }) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.md },
  chips: { gap: spacing.sm },
  separator: { height: spacing.md },
  empty: { ...text('bodyLarge'), color: colors.onSurfaceVariant, textAlign: 'center' },
}))
