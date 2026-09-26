import type { ReactNode } from 'react'
import { type StyleProp, Text, type TextStyle } from 'react-native'

import { makeStyles } from '@/theme'

type Props = {
  type?: 'info' | 'error'
  visible?: boolean
  children: ReactNode
  style?: StyleProp<TextStyle>
}

export function HelperText({ type = 'info', visible = true, children, style }: Props) {
  const styles = useStyles()
  if (!visible) return null

  return <Text style={[type === 'error' ? styles.error : styles.info, style]}>{children}</Text>
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  info: { ...typography.bodySmall, color: colors.onSurfaceVariant, paddingHorizontal: spacing.md },
  error: { ...typography.bodySmall, color: colors.error, paddingHorizontal: spacing.md },
}))
