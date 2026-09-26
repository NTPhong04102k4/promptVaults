import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemedView, ThemedText } from '@/components/Themed';

export default function WelcomeScreen() {
  const { theme } = useTheme();
  return (
    <ThemedView style={styles.container}>
      <ThemedText variant="h1" style={styles.title}>
        PromptVault
      </ThemedText>
      <ThemedText color="secondary" style={styles.subtitle}>
        Lưu trữ gọn gàng – Tìm kiếm thần tốc – Copy 1 chạm cho content creator.
      </ThemedText>

      <Pressable
        style={[styles.primaryButton, { backgroundColor: theme.colors.primary, borderRadius: theme.spacing.radius.md }]}
        onPress={() => router.push('/onboarding/auth?mode=signup')}
      >
        <ThemedText style={styles.primaryButtonText}>Đăng ký / Đăng nhập để đồng bộ</ThemedText>
      </Pressable>

      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <ThemedText color="primary" style={styles.secondaryText}>
          Dùng ngay, không cần tài khoản
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center' },
  primaryButton: { padding: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  secondaryText: { textAlign: 'center', marginTop: 8 },
});
