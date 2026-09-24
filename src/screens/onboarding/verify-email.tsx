import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'

import { AuthLayout, Button, FooterPrompt, OtpInput } from '@/components/ui'
import { resendSignupCode, verifySignupCode } from '@/lib/auth'
import { toAuthError } from '@/lib/authForm'
import { replace, useRouteParams } from '@/navigation'
import { makeStyles, text } from '@/theme'

const CODE_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 60

export default function VerifyEmailScreen() {
  const styles = useStyles()
  const { email = '' } = useRouteParams('verifyEmail')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function handleVerify() {
    setError(null)
    setLoading(true)
    try {
      await verifySignupCode(email, code)
      replace('sync')
    } catch (e) {
      setError(toAuthError(e).message)
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0) return
    setError(null)
    try {
      await resendSignupCode(email)
      setNotice('Đã gửi lại mã, kiểm tra hộp thư của bạn.')
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (e) {
      setError(toAuthError(e).message)
    }
  }

  return (
    <AuthLayout
      align="start"
      title="Xác minh địa chỉ email"
      subtitle={`Chúng tôi đã gửi mã ${CODE_LENGTH} số tới ${email}, vui lòng nhập mã bên dưới.`}
    >
      <View style={styles.codeSection}>
        <Text style={styles.codeLabel}>Nhập mã</Text>
        <OtpInput value={code} onChange={setCode} length={CODE_LENGTH} error={!!error} />
        {error && <Text style={styles.error}>{error}</Text>}
        {notice && !error && <Text style={styles.notice}>{notice}</Text>}
      </View>

      <Button
        label="Tạo tài khoản"
        onPress={handleVerify}
        loading={loading}
        disabled={code.length < CODE_LENGTH}
      />

      <FooterPrompt
        align="left"
        underline
        prompt="Không thấy email?"
        action={cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại'}
        onPress={handleResend}
      />
    </AuthLayout>
  )
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  codeSection: { gap: spacing.md },
  codeLabel: { ...text('titleMedium', 'semiBold'), color: colors.onSurface },
  error: { ...typography.bodySmall, color: colors.error },
  notice: { ...typography.bodySmall, color: colors.onSurfaceVariant },
}))
