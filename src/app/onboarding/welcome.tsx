import { Pressable, StyleSheet, Text, View } from 'react-native'

import { goBack, push } from '@/navigation'
import { useAuthStore } from '@/store'

export default function WelcomeScreen() {
  const completeOnboarding = useAuthStore((state) => state.completeOnboarding)

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PromptVault</Text>
      <Text style={styles.subtitle}>
        Lưu trữ gọn gàng – Tìm kiếm thần tốc – Copy 1 chạm cho content creator.
      </Text>

      <Pressable
        style={styles.primaryButton}
        onPress={() => {
          completeOnboarding()
          push('signup')
        }}
      >
        <Text style={styles.primaryButtonText}>Đăng ký / Đăng nhập để đồng bộ</Text>
      </Pressable>

      <Pressable
        onPress={() => {
          completeOnboarding()
          goBack('home')
        }}
      >
        <Text style={styles.secondaryText}>Dùng ngay, không cần tài khoản</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#555' },
  primaryButton: { backgroundColor: '#208AEF', borderRadius: 8, padding: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  secondaryText: { color: '#208AEF', textAlign: 'center', marginTop: 8 },
})
