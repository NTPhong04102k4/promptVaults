import { Pressable, StyleSheet } from 'react-native'
import { Drawer } from 'expo-router/drawer'

import { Icon } from '@/components/Icon'
import { Avatar } from '@/components/ui'
import { getInitials } from '@/lib/format'
import { navigate } from '@/navigation'
import { useAuthStore } from '@/store'
import { useTheme } from '@/theme'

// Trailing avatar on the Settings app bar — taps through to the Profile tab.
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

export default function DrawerLayout() {
  const { colors, typography, shape } = useTheme()

  return (
    <Drawer
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.onSurface,
        headerTitleStyle: typography.titleLarge,
        headerShadowVisible: false,
        headerRight: () => <HeaderAvatar />,
        drawerStyle: { backgroundColor: colors.surfaceContainerLow },
        drawerActiveBackgroundColor: colors.secondaryContainer,
        drawerActiveTintColor: colors.onSecondaryContainer,
        drawerInactiveTintColor: colors.onSurfaceVariant,
        drawerLabelStyle: typography.labelLarge,
        drawerItemStyle: { borderRadius: shape.full },
      }}
    >
      <Drawer.Screen
        name="(tabs)"
        options={{
          title: 'Trang chủ',
          headerShown: false,
          drawerIcon: ({ color, size }) => <Icon name="home" color={color} size={size} />,
        }}
      />
      <Drawer.Screen
        name="settings"
        options={{
          title: 'Cài đặt',
          drawerIcon: ({ color, size }) => <Icon name="settings" color={color} size={size} />,
        }}
      />
    </Drawer>
  )
}

const styles = StyleSheet.create({
  headerAvatar: { marginRight: 16 },
})
