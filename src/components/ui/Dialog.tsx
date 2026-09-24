import type { ReactNode } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'

import { makeStyles } from '@/theme'

type DialogProps = { visible: boolean; onDismiss: () => void; dismissable?: boolean; children: ReactNode }

function DialogBase({ visible, onDismiss, dismissable = true, children }: DialogProps) {
  const styles = useStyles()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        onPress={dismissable ? onDismiss : undefined}
      >
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function DialogIcon({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return <View style={styles.icon}>{children}</View>
}

function Title({ children }: { children: string }) {
  const styles = useStyles()
  return <Text style={styles.title}>{children}</Text>
}

function Content({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return <View style={styles.content}>{children}</View>
}

function Actions({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return <View style={styles.actions}>{children}</View>
}

function ScrollArea({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return <View style={styles.scrollArea}>{children}</View>
}

export const Dialog = Object.assign(DialogBase, { Icon: DialogIcon, Title, Content, Actions, ScrollArea })

const useStyles = makeStyles(({ colors, shape, spacing, typography }) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: { width: '100%', maxWidth: 400, borderRadius: shape.extraLarge, backgroundColor: colors.surfaceContainerHigh, paddingVertical: spacing.lg },
  icon: { alignItems: 'center', paddingBottom: spacing.md },
  title: { ...typography.headlineSmall, color: colors.onSurface, textAlign: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  scrollArea: { paddingHorizontal: spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.outlineVariant, maxHeight: 240 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xs },
}))
