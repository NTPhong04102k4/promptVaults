import { Text } from 'react-native'

import { makeStyles, text } from '@/theme'

type Props = {
  prompt: string
  action: string
  onPress: () => void
  underline?: boolean
  align?: 'center' | 'left'
}

// "Have an account? Sign in here" — plain text followed by an inline link.
export function FooterPrompt({ prompt, action, onPress, underline, align = 'center' }: Props) {
  const styles = useStyles()
  return (
    <Text style={[styles.prompt, { textAlign: align }]}>
      {prompt}{' '}
      <Text
        accessibilityRole="link"
        onPress={onPress}
        suppressHighlighting
        style={[styles.link, underline && styles.underline]}
      >
        {action}
      </Text>
    </Text>
  )
}

const useStyles = makeStyles(({ colors, typography }) => ({
  prompt: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
  link: { ...text('bodyMedium', 'semiBold'), color: colors.primary },
  underline: { textDecorationLine: 'underline' },
}))
