import { useState } from 'react'

import { AuthLayout, Button, FooterPrompt, TextField } from '@/components/ui'
import { forgotPassword } from '@/lib/authApi'
import { toAuthError, validateEmail } from '@/lib/authForm'
import { push, replace, useRouteParams } from '@/navigation'

export default function ForgotPasswordScreen() {
  const params = useRouteParams('forgotPassword')
  const [email, setEmail] = useState(params.email ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    const emailError = validateEmail(email)
    setError(emailError)
    if (emailError) return

    setLoading(true)
    try {
      // Always 200 whether or not the address exists (AuthController.ForgotPassword).
      await forgotPassword(email.trim())
      push('resetPassword', { email: email.trim() })
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
      subtitle="Nhập email đã đăng ký. Chúng tôi sẽ gửi mã xác minh gồm 6 số."
    >
      <TextField
        label="Email"
        placeholder="ban@gmail.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        error={error}
      />

      <Button label="Gửi mã" onPress={handleSubmit} loading={loading} />

      <FooterPrompt
        align="left"
        prompt="Đã nhớ mật khẩu?"
        action="Đăng nhập"
        onPress={() => replace('login', { email: email.trim() })}
      />
    </AuthLayout>
  )
}
