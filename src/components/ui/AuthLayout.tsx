import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Icon } from '@/components/Icon'
import { goBack } from '@/navigation'
import { makeStyles, text, useTheme } from '@/theme'

type Props = {
  title: string
  subtitle?: string
  // center = Signup/Login header; start = Verify/Forgot header with supporting text.
  align?: 'center' | 'start'
  children: ReactNode
}

export function AuthLayout({ title, subtitle, align = 'center', children }: Props) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => goBack('welcome')}
            style={styles.back}
          >
            <Icon name="back" size={20} color={colors.onSurface} />
          </Pressable>

          <View style={align === 'center' ? styles.headerCenter : styles.headerStart}>
            <Text
              accessibilityRole="header"
              style={align === 'center' ? styles.titleCenter : styles.titleStart}
            >
              {title}
            </Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const useStyles = makeStyles(({ colors, typography, shape, spacing }) => ({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  back: {
    width: 40,
    height: 40,
    marginTop: spacing.sm,
    borderRadius: shape.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  headerCenter: { alignItems: 'center', marginTop: -spacing.lg, marginBottom: spacing.lg },
  headerStart: { gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.xl },
  titleCenter: { ...text('headlineSmall', 'bold'), color: colors.onSurface },
  titleStart: { ...text('headlineSmall', 'medium'), color: colors.onSurface },
  subtitle: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
}))
