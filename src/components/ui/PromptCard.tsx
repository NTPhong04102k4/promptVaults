import { Pressable, Text, View } from 'react-native'

import { Icon } from '@/components/Icon'
import { makeStyles, text, useTheme } from '@/theme'

type Props = {
  title: string
  snippet: string
  category: string | null
  isFavorite: boolean
  onPress: () => void
  onToggleFavorite: () => void
  onCopy: () => void
}

export function PromptCard({
  title,
  snippet,
  category,
  isFavorite,
  onPress,
  onToggleFavorite,
  onCopy,
}: Props) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}
            hitSlop={8}
            onPress={onToggleFavorite}
          >
            <Icon
              name={isFavorite ? 'favoriteFilled' : 'favorite'}
              size={20}
              color={colors.onSurface}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy nội dung"
            hitSlop={8}
            onPress={onCopy}
          >
            <Icon name="copy" size={20} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.snippet} numberOfLines={2}>
        {snippet}
      </Text>

      {category && (
        <View style={styles.categoryTag}>
          <Text style={styles.categoryLabel}>{category}</Text>
        </View>
      )}
    </Pressable>
  )
}

const useStyles = makeStyles(({ colors, shape, spacing }) => ({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: shape.medium,
    backgroundColor: colors.surfaceContainer,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...text('titleMedium', 'medium'), flex: 1, color: colors.onSurface },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  snippet: { ...text('bodySmall'), color: colors.onSurfaceVariant },
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
}))
