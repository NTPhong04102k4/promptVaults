import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'

import { Icon, type IconName } from '@/components/Icon'
import { makeStyles, useTheme } from '@/theme'

type Props = {
  visible: boolean
  onDismiss: () => void
  anchor: ReactElement
  children: ReactNode
}

function MenuBase({ visible, onDismiss, anchor, children }: Props) {
  const styles = useStyles()
  const anchorRef = useRef<View>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!visible) return
    anchorRef.current?.measureInWindow((x, y, _width, height) => {
      setPosition({ top: y + height, left: x })
    })
  }, [visible])

  return (
    <>
      <View ref={anchorRef}>{anchor}</View>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
        <Pressable style={styles.backdrop} accessibilityRole="button" onPress={onDismiss}>
          <View style={[styles.menu, { top: position.top, left: position.left }]}>{children}</View>
        </Pressable>
      </Modal>
    </>
  )
}

type ItemProps = { title: string; onPress: () => void; leadingIcon?: IconName; disabled?: boolean }

function Item({ title, onPress, leadingIcon, disabled }: ItemProps) {
  const styles = useStyles()
  const { colors } = useTheme()

  return (
    <Pressable accessibilityRole="menuitem" disabled={disabled} onPress={onPress} style={styles.item}>
      {leadingIcon && (
        <Icon name={leadingIcon} size={20} color={disabled ? colors.outlineVariant : colors.onSurfaceVariant} />
      )}
      <Text style={[styles.itemLabel, disabled && { color: colors.outlineVariant }]}>{title}</Text>
    </Pressable>
  )
}

export const Menu = Object.assign(MenuBase, { Item })

const useStyles = makeStyles(({ colors, shape, spacing, typography }) => ({
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    minWidth: 160,
    paddingVertical: spacing.xs,
    borderRadius: shape.extraSmall,
    backgroundColor: colors.surfaceContainer,
    elevation: 3,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  itemLabel: { ...typography.bodyLarge, color: colors.onSurface },
}))
