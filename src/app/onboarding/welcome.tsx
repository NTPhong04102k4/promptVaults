import { Text, View } from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'

import logoGlow from '@/assets/images/logo-glow.png'
import { Button, FooterPrompt } from '@/components/ui'
import { goBack, push } from '@/navigation'
import { makeStyles, text } from '@/theme'

export default function WelcomeScreen() {
  const styles = useStyles()

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Image source={logoGlow} style={styles.logo} contentFit="contain" />

        <View style={styles.textGroup}>
          <Text accessibilityRole="header" style={styles.title}>
            PromptVault
          </Text>
          <Text style={styles.subtitle}>
            Lưu trữ gọn gàng, tìm kiếm thần tốc, copy 1 chạm cho mọi prompt của bạn.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button label="Đăng ký" onPress={() => push('signup')} />
          <FooterPrompt prompt="Đã có tài khoản?" action="Đăng nhập" onPress={() => push('login')} />
        </View>

        <Text
          accessibilityRole="link"
          suppressHighlighting
          style={styles.skip}
          onPress={() => goBack('home')}
        >
          Dùng ngay, không cần tài khoản
        </Text>
      </View>
    </SafeAreaView>
  )
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xxl,
  },
  logo: { width: 160, height: 160, alignSelf: 'center' },
  textGroup: { alignItems: 'center', gap: spacing.sm },
  title: { ...text('headlineLarge', 'bold'), color: colors.onSurface, textAlign: 'center' },
  subtitle: { ...typography.bodyMedium, color: colors.onSurfaceVariant, textAlign: 'center' },
  actions: { gap: spacing.lg },
  skip: { ...text('bodyMedium', 'semiBold'), color: colors.primary, textAlign: 'center' },
}))
