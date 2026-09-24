import { useState } from 'react'
import { Text, View } from 'react-native'
import { Image } from 'expo-image'

import googleLogo from '@/assets/images/google.svg'
import { AuthLayout, Button, Checkbox, FooterPrompt, OrDivider, TextField } from '@/components/ui'
import { getSession, signInWithEmail, signInWithGoogle } from '@/lib/auth'
import { type AuthErrorField, toAuthError, validateEmail } from '@/lib/authForm'
import { push, replace, useRouteParams } from '@/navigation'
import { useAuthStore } from '@/store'
import { makeStyles, text } from '@/theme'

type Errors = Partial<Record<AuthErrorField, string>>

export default function LoginScreen() {
  const styles = useStyles()
  const params = useRouteParams('login')
  const keepSignedIn = useAuthStore((state) => state.keepSignedIn)
  const setKeepSignedIn = useAuthStore((state) => state.setKeepSignedIn)
  const [email, setEmail] = useState(params.email ?? '')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    const next: Errors = {}
    const emailError = validateEmail(email)
    if (emailError) next.email = emailError
    if (!password) next.password = 'Vui lòng nhập mật khẩu.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    try {
      await signInWithEmail({ email: email.trim(), password })
      replace('sync')
    } catch (e) {
      const { field, message } = toAuthError(e)
      // Signed up but never entered the code — send them to finish verification.
      if (e instanceof Error && e.message === 'email_not_confirmed') {
        push('verifyEmail', { email: email.trim() })
      } else {
        setErrors({ [field]: message })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setErrors({})
    setLoading(true)
    try {
      await signInWithGoogle()
      if (await getSession()) replace('sync')
    } catch (e) {
      setErrors({ form: toAuthError(e).message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Đăng nhập">
      <View style={styles.googleGap}>
        <Button
          variant="tonal"
          label="Đăng nhập với Google"
          icon={<Image source={googleLogo} style={styles.googleLogo} />}
          onPress={handleGoogle}
          disabled={loading}
        />
      </View>

      <OrDivider label="hoặc đăng nhập bằng email" />

      <View style={styles.fields}>
        <TextField
          label="Email"
          placeholder="ban@gmail.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
        />
        <TextField
          label="Mật khẩu"
          placeholder="••••••••"
          secure
          autoComplete="current-password"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          labelAction={
            <Text
              accessibilityRole="link"
              suppressHighlighting
              style={styles.forgot}
              onPress={() => push('forgotPassword', { email: email.trim() })}
            >
              Quên mật khẩu?
            </Text>
          }
        />
      </View>

      <Checkbox
        checked={keepSignedIn}
        onChange={setKeepSignedIn}
        accessibilityLabel="Duy trì đăng nhập"
      >
        <Text style={styles.keepText}>Duy trì đăng nhập</Text>
      </Checkbox>

      {errors.form && <Text style={styles.error}>{errors.form}</Text>}

      <Button label="Đăng nhập" onPress={handleLogin} loading={loading} />

      <FooterPrompt
        prompt="Chưa có tài khoản?"
        action="Đăng ký tại đây"
        onPress={() => replace('signup')}
      />
    </AuthLayout>
  )
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  googleGap: { marginTop: spacing.lg },
  googleLogo: { width: 20, height: 20 },
  fields: { gap: spacing.lg },
  forgot: { ...text('bodyMedium', 'semiBold'), color: colors.primary },
  keepText: { ...typography.bodyLarge, color: colors.onSurface },
  error: { ...typography.bodySmall, color: colors.error },
}))
