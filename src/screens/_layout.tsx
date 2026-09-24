import { useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFonts } from 'expo-font'
import { ThemeProvider as NavigationThemeProvider, SplashScreen, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

import { isAppLockEnabled } from '@/lib/appLock'
import { authenticateWithBiometric } from '@/lib/biometric'
import { isOAuthInProgress } from '@/lib/oauthState'
import { toNavigationTheme } from '@/navigation'
import { startAuthListener, useAuthStore } from '@/store'
import { fontAssets, type Theme, ThemeProvider, useTheme } from '@/theme'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  )
}

// Reads `useTheme()`, so it must render inside `<ThemeProvider>` rather than alongside it.
function RootLayoutContent() {
  const theme = useTheme()
  const [fontsLoaded, fontError] = useFonts(fontAssets)
  const hydrated = useAuthStore((state) => state.hydrated)
  const [checked, setChecked] = useState(false)
  const [locked, setLocked] = useState(false)
  const appState = useRef<AppStateStatus>(AppState.currentState)

  function checkLock() {
    isAppLockEnabled().then((enabled) => {
      setLocked(enabled)
      setChecked(true)
    })
  }

  useEffect(() => startAuthListener(), [])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (
        appState.current.match(/inactive|background/) &&
        next === 'active' &&
        !isOAuthInProgress()
      ) {
        checkLock()
      }
      appState.current = next
    })
    checkLock()
    return () => subscription.remove()
  }, [])

  // A font load failure falls back to the system font rather than blocking the app.
  const ready = (fontsLoaded || fontError !== null) && hydrated && checked

  useEffect(() => {
    if (ready) SplashScreen.hideAsync()
  }, [ready])

  async function handleUnlock() {
    const success = await authenticateWithBiometric()
    if (success) setLocked(false)
  }

  if (!ready) return null

  const styles = createStyles(theme)

  if (locked) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>PromptVault đã khoá</Text>
        <Pressable style={styles.button} onPress={handleUnlock}>
          <Text style={styles.buttonText}>Mở khoá</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <NavigationThemeProvider value={toNavigationTheme(theme)}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerTitleStyle: theme.typography.titleLarge, headerShown: false }}>
        <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
        <Stack.Screen name="prompt-detail" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="prompt-edit"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            sheetCornerRadius: theme.shape.extraLarge,
          }}
        />
        <Stack.Screen
          name="vault-switcher"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            sheetCornerRadius: theme.shape.extraLarge,
          }}
        />
        <Stack.Screen name="onboarding/welcome" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/signup" />
        <Stack.Screen name="onboarding/login" />
        <Stack.Screen name="onboarding/verify-email" />
        <Stack.Screen name="onboarding/forgot-password" />
        <Stack.Screen name="onboarding/sync" options={{ headerShown: true, title: 'Đồng bộ' }} />
      </Stack>
    </NavigationThemeProvider>
  )
}

function createStyles({ colors, typography, shape, spacing }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
      backgroundColor: colors.surface,
    },
    title: { ...typography.titleLarge, color: colors.onSurface },
    button: {
      backgroundColor: colors.primary,
      borderRadius: shape.full,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
    },
    buttonText: { ...typography.labelLarge, color: colors.onPrimary },
  })
}
