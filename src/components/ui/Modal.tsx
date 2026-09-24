import type { ReactNode } from 'react'
import { Pressable, Modal as RNModal, type StyleProp, type ViewStyle } from 'react-native'

import { makeStyles } from '@/theme'

type Props = {
  visible: boolean
  onDismiss: () => void
  dismissable?: boolean
  children: ReactNode
  contentContainerStyle?: StyleProp<ViewStyle>
}

export function Modal({ visible, onDismiss, dismissable = true, children, contentContainerStyle }: Props) {
  const styles = useStyles()

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        onPress={dismissable ? onDismiss : undefined}
      >
        <Pressable style={[styles.content, contentContainerStyle]} onPress={(e) => e.stopPropagation()}>
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  )
}

const useStyles = makeStyles(({ colors, shape, spacing }) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: { backgroundColor: colors.surfaceContainerLow, borderRadius: shape.extraLarge, padding: spacing.lg },
}))
