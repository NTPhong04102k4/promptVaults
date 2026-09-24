import { Pressable, StyleSheet, View } from 'react-native'
import { Tabs } from 'expo-router'
import { DrawerToggleButton } from 'expo-router/drawer'

import { Icon, type IconName } from '@/components/Icon'
import { Avatar } from '@/components/ui'
import { getInitials } from '@/lib/format'
import { navigate } from '@/navigation'
import { useAuthStore } from '@/store'
import { useTheme } from '@/theme'

type TabIconProps = { focused: boolean; outline: IconName; filled: IconName }

// M3 navigation bar: the active icon sits on a secondaryContainer pill.
function TabIcon({ focused, outline, filled }: TabIconProps) {
  const { colors, shape } = useTheme()
  return (
    <View
      style={[
        styles.indicator,
        { borderRadius: shape.full },
        focused && { backgroundColor: colors.secondaryContainer },
      ]}
    >
      <Icon
        name={focused ? filled : outline}
        color={focused ? colors.onSecondaryContainer : colors.onSurfaceVariant}
      />
    </View>
  )
}

// Trailing avatar on every tab's app bar — taps through to the Profile tab.
function HeaderAvatar() {
  const user = useAuthStore((state) => state.user)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Hồ sơ"
      hitSlop={8}
      style={styles.headerAvatar}
      onPress={() => navigate('profile')}
    >
      <Avatar label={getInitials(user)} />
    </Pressable>
  )
}

export default function TabsLayout() {
  const { colors, typography } = useTheme()

  return (
    <Tabs
      screenOptions={{
        headerLeft: () => <DrawerToggleButton tintColor={colors.onSurface} />,
        headerRight: () => <HeaderAvatar />,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.onSurface,
        headerTitleStyle: typography.titleLarge,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.surfaceContainer, borderTopWidth: 0 },
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarLabelStyle: typography.labelMedium,
        tabBarIconStyle: styles.indicator,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Trang chủ',
          headerTitle: 'PromptVault',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} outline="home" filled="homeFilled" />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Tìm kiếm',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} outline="search" filled="search" />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Yêu thích',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} outline="favorite" filled="favoriteFilled" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Hồ sơ',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} outline="person" filled="personFilled" />
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  indicator: { width: 64, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerAvatar: { marginRight: 16 },
})
