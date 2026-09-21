import { StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { signOut } from '@/lib/auth';
import { useSessionStore } from '@/store/sessionStore';
import { ThemedView, ThemedText } from '@/components/Themed';

export default function Index() {
  const session = useSessionStore((s) => s.session);

  return (
    <ThemedView style={styles.container}>
      <ThemedText>Edit src/app/index.tsx to edit this screen.</ThemedText>

      <Pressable onPress={() => router.push('/onboarding/welcome')} style={styles.accountRow}>
        <ThemedText color="primary">
          {session ? `Đã đồng bộ với ${session.user.email}` : 'Đăng nhập để đồng bộ'}
        </ThemedText>
      </Pressable>

      <Pressable onPress={() => router.push('/settings')} style={styles.accountRow}>
        <ThemedText color="primary">Cài đặt</ThemedText>
      </Pressable>

      {session && (
        <Pressable onPress={() => signOut()} style={styles.accountRow}>
          <ThemedText color="primary">Đăng xuất</ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  accountRow: { padding: 12 },
});
