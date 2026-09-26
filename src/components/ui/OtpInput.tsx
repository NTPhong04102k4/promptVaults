import { useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'

import { makeStyles } from '@/theme'

type Props = {
  value: string
  onChange: (value: string) => void
  length?: number
  error?: boolean
}

// One hidden TextInput drives the boxes, so paste and SMS/email autofill work natively.
export function OtpInput({ value, onChange, length = 6, error }: Props) {
  const styles = useStyles()
  const inputRef = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const activeIndex = Math.min(value.length, length - 1)

  return (
    <Pressable style={styles.row} onPress={() => inputRef.current?.focus()}>
      {Array.from({ length }, (_, i) => (
        <View
          key={i}
          style={[
            styles.box,
            focused && i === activeIndex && styles.boxActive,
            error && styles.boxError,
          ]}
        >
          <Text style={value[i] ? styles.digit : styles.placeholder}>{value[i] ?? '-'}</Text>
        </View>
      ))}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(next) => onChange(next.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        accessibilityLabel="Mã xác minh"
        style={styles.hiddenInput}
      />
    </Pressable>
  )
}

const useStyles = makeStyles(({ colors, typography, shape, spacing }) => ({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  box: {
    flex: 1,
    maxWidth: 52,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: shape.small,
    backgroundColor: colors.surfaceContainerLowest,
  },
  boxActive: { borderColor: colors.primary, borderWidth: 2 },
  boxError: { borderColor: colors.error },
  digit: { ...typography.titleLarge, color: colors.onSurface },
  placeholder: { ...typography.bodyLarge, color: colors.outline },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
}))
