import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Session } from '@supabase/supabase-js'

import { getSession, onAuthStateChange, signOut } from '@/lib/auth'
import { push, Router } from '@/navigation'
import { useTheme } from '@/theme'

export default function Index() {
  const [session, setSession] = useState<Session | null>(null)
  const { colors } = useTheme()
  useEffect(() => {
    getSession().then(setSession)
    return onAuthStateChange(setSession)
  }, [])

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
        },
      ]}
    >
      <Text>Edit src/app/index.tsx to edit this screen.</Text>

      <Pressable onPress={() => push(Router.welcome)} style={styles.accountRow}>
        <Text style={styles.accountText}>
          {session ? `Đã đồng bộ với ${session.user.email}` : 'Đăng nhập để đồng bộ'}
        </Text>
      </Pressable>

      <Pressable onPress={() => push(Router.settings)} style={styles.accountRow}>
        <Text style={styles.accountText}>Cài đặt</Text>
      </Pressable>

      {session && (
        <Pressable onPress={() => signOut()} style={styles.accountRow}>
          <Text style={styles.accountText}>Đăng xuất</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  accountRow: { padding: 12 },
  accountText: { color: '#208AEF' },
})
