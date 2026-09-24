import { useState } from 'react'
import { Text } from 'react-native'

import { AuthLayout, Button, FooterPrompt, TextField } from '@/components/ui'
import { sendPasswordReset } from '@/lib/auth'
import { toAuthError, validateEmail } from '@/lib/authForm'
import { replace, useRouteParams } from '@/navigation'
import { makeStyles } from '@/theme'

export default function ForgotPasswordScreen() {
  const styles = useStyles()
  const params = useRouteParams('forgotPassword')
  const [email, setEmail] = useState(params.email ?? '')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    const emailError = validateEmail(email)
    setError(emailError)
    if (emailError) return

    setLoading(true)
    try {
      await sendPasswordReset(email.trim())
      setSent(true)
    } catch (e) {
      setError(toAuthError(e).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      align="start"
      title="Quên mật khẩu"
      subtitle="Nhập email đã đăng ký với tài khoản của bạn. Chúng tôi sẽ gửi link để đặt lại mật khẩu."
    >
      <TextField
        label="Email"
        placeholder="ban@gmail.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={(value) => {
          setEmail(value)
          setSent(false)
        }}
        error={error}
      />

      {sent && (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          Đã gửi link đặt lại mật khẩu tới {email.trim()}. Kiểm tra hộp thư của bạn.
        </Text>
      )}

      <Button label={sent ? 'Gửi lại' : 'Gửi'} onPress={handleSubmit} loading={loading} />

      <FooterPrompt
        align="left"
        prompt="Đã nhớ mật khẩu?"
        action="Đăng nhập"
        onPress={() => replace('login', { email: email.trim() })}
      />
    </AuthLayout>
  )
}

const useStyles = makeStyles(({ colors, typography }) => ({
  notice: { ...typography.bodyMedium, color: colors.primary },
}))
