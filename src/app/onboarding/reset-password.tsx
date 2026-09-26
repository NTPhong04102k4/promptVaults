import { useState } from 'react'
import { Text, View } from 'react-native'

import { AuthLayout, Button, OtpInput, TextField } from '@/components/ui'
import { resetPassword, verifyPasswordOtp } from '@/lib/authApi'
import { toAuthError, validatePassword, validateTemporaryPassword } from '@/lib/authForm'
import { replace, useRouteParams } from '@/navigation'
import { makeStyles, text } from '@/theme'

const CODE_LENGTH = 6

type Errors = { code?: string; temp?: string; password?: string; confirm?: string; form?: string }

// AioKin reset is 3 steps: OTP → temporary password by e-mail (3 min) → new password.
export default function ResetPasswordScreen() {
  const styles = useStyles()
  const { email = '' } = useRouteParams('resetPassword')
  const [step, setStep] = useState<'otp' | 'reset'>('otp')
  const [code, setCode] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [minutes, setMinutes] = useState(3)
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)

  async function handleVerifyCode() {
    setErrors({})
    setLoading(true)
    try {
      const { expiresInMinutes } = await verifyPasswordOtp(email, code)
      setMinutes(expiresInMinutes)
      setStep('reset')
    } catch (e) {
      setErrors({ code: toAuthError(e).message })
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    const next: Errors = {}
    const tempError = validateTemporaryPassword(temporaryPassword)
    if (tempError) next.temp = tempError
    const passwordError = validatePassword(password)
    if (passwordError) next.password = passwordError
    if (confirm !== password) next.confirm = 'Mật khẩu nhập lại không khớp.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    try {
      await resetPassword(email, temporaryPassword.trim(), password)
      replace('login', { email })
    } catch (e) {
      const { field, message } = toAuthError(e)
      setErrors(field === 'code' ? { temp: message } : { form: message })
    } finally {
      setLoading(false)
    }
  }

  if (step === 'otp') {
    return (
      <AuthLayout
        align="start"
        title="Nhập mã xác minh"
        subtitle={`Chúng tôi đã gửi mã ${CODE_LENGTH} số tới ${email}.`}
      >
        <View style={styles.codeSection}>
          <OtpInput value={code} onChange={setCode} length={CODE_LENGTH} error={!!errors.code} />
          {errors.code && <Text style={styles.error}>{errors.code}</Text>}
        </View>
        <Button
          label="Xác minh"
          onPress={handleVerifyCode}
          loading={loading}
          disabled={code.length < CODE_LENGTH}
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      align="start"
      title="Đặt mật khẩu mới"
      subtitle={`Mật khẩu tạm đã được gửi tới ${email} và có hiệu lực ${minutes} phút.`}
    >
      <View style={styles.fields}>
        <TextField
          label="Mật khẩu tạm"
          autoCapitalize="none"
          autoCorrect={false}
          value={temporaryPassword}
          onChangeText={setTemporaryPassword}
          error={errors.temp}
        />
        <TextField
          label="Mật khẩu mới"
          placeholder="••••••••"
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
        />
        <TextField
          label="Nhập lại mật khẩu mới"
          placeholder="••••••••"
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
        />
      </View>
      {errors.form && <Text style={styles.error}>{errors.form}</Text>}
      <Button label="Đổi mật khẩu" onPress={handleReset} loading={loading} />
    </AuthLayout>
  )
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  codeSection: { gap: spacing.md },
  fields: { gap: spacing.lg },
  label: { ...text('titleMedium', 'semiBold'), color: colors.onSurface },
  error: { ...typography.bodySmall, color: colors.error },
}))
