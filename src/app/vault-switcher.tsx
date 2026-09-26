import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'

import { Icon } from '@/components/Icon'
import { Button, TextField } from '@/components/ui'
import { toAuthError } from '@/lib/authForm'
import { createTeamSpace, fetchAndStoreMySpaces, listSpaces, type Space } from '@/lib/spaces'
import { goBack, push } from '@/navigation'
import { useAuthStore, useSpaceStore } from '@/store'
import { makeStyles, text, useTheme } from '@/theme'

function spaceLabel(space: Space): string {
  if (space.kind === 'local') return 'Trên máy này'
  if (space.kind === 'personal') return 'Kho cá nhân'
  return space.name
}

export default function VaultSwitcherScreen() {
  const styles = useStyles()
  const { colors } = useTheme()
  const user = useAuthStore((state) => state.user)
  const currentSpaceId = useSpaceStore((state) => state.currentSpaceId)
  const setCurrentSpace = useSpaceStore((state) => state.setCurrentSpace)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let active = true
      listSpaces().then((local) => {
        if (active) setSpaces(local)
      })
      if (user) {
        fetchAndStoreMySpaces()
          .then(() => listSpaces())
          .then((fresh) => {
            if (active) setSpaces(fresh)
          })
          .catch(() => undefined) // offline: keep the local list
      }
      return () => {
        active = false
      }
    }, [user]),
  )

  function choose(space: Space) {
    setCurrentSpace(space.id)
    goBack('home')
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError('Vui lòng nhập tên kho.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const space = await createTeamSpace(name.trim())
      setCurrentSpace(space.id)
      goBack('home')
    } catch (e) {
      setError(toAuthError(e).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chọn kho lưu trữ</Text>

      {spaces.map((space) => (
        <Pressable key={space.id} style={styles.row} onPress={() => choose(space)}>
          <View style={styles.rowLeading}>
            <Icon
              name={space.kind === 'family' || space.kind === 'team' ? 'home' : 'lock'}
              size={20}
              color={colors.onSurfaceVariant}
            />
            <Text style={styles.label}>{spaceLabel(space)}</Text>
          </View>
          {space.id === currentSpaceId && <Icon name="check" size={20} color={colors.primary} />}
        </Pressable>
      ))}

      {creating ? (
        <View style={styles.createForm}>
          <TextField label="Tên kho" value={name} onChangeText={setName} error={error} />
          <Button label="Tạo" onPress={handleCreate} loading={saving} />
        </View>
      ) : (
        <Pressable style={styles.row} onPress={() => (user ? setCreating(true) : push('login'))}>
          <View style={styles.rowLeading}>
            <Icon name="add" size={20} color={colors.primary} />
            <Text style={styles.newLabel}>
              {user ? 'Tạo kho mới' : 'Đăng nhập để tạo kho nhóm'}
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  )
}

const useStyles = makeStyles(({ colors, spacing }) => ({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  title: { ...text('headlineSmall'), color: colors.onSurface, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowLeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...text('bodyLarge'), color: colors.onSurface },
  newLabel: { ...text('bodyLarge'), color: colors.primary },
  createForm: { gap: spacing.md },
}))
