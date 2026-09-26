import { Pressable, Text, View } from 'react-native'

import { Icon, type IconName } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

type Route = { key: string; title: string; icon: IconName }

type Props = {
  navigationState: { index: number; routes: Route[] }
  onIndexChange: (index: number) => void
}

// Presentational bar only — this app's tabs already route via expo-router's file-based
// (drawer)/(tabs) layout, so there's no renderScene/renderIcon indirection to clone here.
export function BottomNavigation({ navigationState, onIndexChange }: Props) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <View style={styles.bar}>
      {navigationState.routes.map((route, index) => {
        const active = index === navigationState.index
        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onIndexChange(index)}
            style={styles.tab}
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Icon name={route.icon} size={24} color={active ? colors.onSecondaryContainer : colors.onSurfaceVariant} />
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {route.title}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const useStyles = makeStyles(({ colors, shape, spacing, typography }) => ({
  bar: { flexDirection: 'row', height: 80, paddingTop: spacing.sm, backgroundColor: colors.surfaceContainer },
  tab: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  iconWrap: { width: 64, height: 32, borderRadius: shape.full, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: colors.secondaryContainer },
  label: { ...typography.labelMedium, color: colors.onSurfaceVariant },
  labelActive: { color: colors.onSurface },
}))
