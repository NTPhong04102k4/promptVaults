import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { Image } from 'expo-image'

import googleLogo from '@/assets/images/google.svg'
import { AuthLayout, Button, Checkbox, FooterPrompt, OrDivider, TextField } from '@/components/ui'
import { login, loginWithFacebookNative, loginWithGoogleNative } from '@/lib/authApi'
import { type AuthErrorField, toAuthError } from '@/lib/authForm'
import { isBiometricAvailable } from '@/lib/biometric'
import { getBiometricEnrollment, signInWithBiometric } from '@/lib/biometricLogin'
import { signInWithFacebookNative } from '@/lib/facebookNativeLogin'
import { signInWithGoogleNative } from '@/lib/googleNativeLogin'
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
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricReady, setBiometricReady] = useState(false)

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable)
    getBiometricEnrollment().then((e) => setBiometricReady(e !== null))
  }, [])

  async function handleBiometric() {
    setErrors({})
    setLoading(true)
    try {
      if ((await signInWithBiometric()) === 'signed_in') {
        await useAuthStore.getState().refreshUser()
        replace('sync')
      }
    } catch {
      // Server answers every failure with the same InvalidCredentials by design.
      setErrors({ form: 'Không đăng nhập được bằng sinh trắc học, hãy dùng mật khẩu.' })
    } finally {
      setLoading(false)
    }
  }

  // Test song song voi luong WebView (Huong B) ben duoi — cung mot tai khoan/lien-ket-theo-email,
  // chi khac cach lay token: SDK native tra ve idToken/accessToken truc tiep, khong qua WebView.
  async function handleGoogleNative() {
    setErrors({})
    setLoading(true)
    try {
      const result = await signInWithGoogleNative()
      if (!result.ok) {
        if (!result.cancelled) setErrors({ form: result.error })
        return
      }
      await loginWithGoogleNative(result.idToken)
      await useAuthStore.getState().refreshUser()
      replace('sync')
    } catch (e) {
      const { field, message } = toAuthError(e)
      setErrors({ [field]: message })
    } finally {
      setLoading(false)
    }
  }

  async function handleFacebookNative() {
    setErrors({})
    setLoading(true)
    try {
      const result = await signInWithFacebookNative()
      if (!result.ok) {
        if (!result.cancelled) setErrors({ form: result.error })
        return
      }
      await loginWithFacebookNative(result.accessToken)
      await useAuthStore.getState().refreshUser()
      replace('sync')
    } catch (e) {
      const { field, message } = toAuthError(e)
      setErrors({ [field]: message })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin() {
    const next: Errors = {}
    if (!email.trim()) next.email = 'Vui lòng nhập email hoặc username.'
    if (!password) next.password = 'Vui lòng nhập mật khẩu.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    try {
      await login(email.trim(), password)
      await useAuthStore.getState().refreshUser()
      replace('sync')
    } catch (e) {
      const { field, message } = toAuthError(e)
      setErrors({ [field]: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Đăng nhập">
      {biometricReady ? (
        <Button
          variant="tonal"
          label="Đăng nhập bằng vân tay / Face ID"
          onPress={handleBiometric}
          disabled={loading}
        />
      ) : (
        biometricAvailable && (
          <Text style={styles.biometricHint}>
            Đặt vân tay đăng nhập nhanh trong Cài đặt sau khi đăng nhập.
          </Text>
        )
      )}

      <View style={styles.socialGap}>
        <Button
          variant="tonal"
          label="Đăng nhập với Google"
          icon={<Image source={googleLogo} style={styles.socialLogo} />}
          onPress={() => push('oauthWebview', { provider: 'google' })}
          disabled={loading}
        />
        <Button
          variant="tonal"
          label="Đăng nhập với Facebook"
          onPress={() => push('oauthWebview', { provider: 'facebook' })}
          disabled={loading}
        />

        {/* Test song song luong native SDK — xem so sanh trong oauthWebLogin.ts (Huong B). */}
        <Button
          variant="tonal"
          label="Google (Native SDK)"
          icon={<Image source={googleLogo} style={styles.socialLogo} />}
          onPress={handleGoogleNative}
          disabled={loading}
        />
        <Button
          variant="tonal"
          label="Facebook (Native SDK)"
          onPress={handleFacebookNative}
          disabled={loading}
        />
      </View>

      <OrDivider label="hoặc đăng nhập bằng email" />

      <View style={styles.fields}>
        <TextField
          label="Email hoặc username"
          placeholder="ban@gmail.com"
          autoCapitalize="none"
          autoComplete="username"
          keyboardType="email-address"
          textContentType="username"
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
  socialGap: { gap: spacing.md },
  socialLogo: { width: 20, height: 20 },
  biometricHint: { ...typography.bodySmall, color: colors.onSurfaceVariant, textAlign: 'center' },
  fields: { gap: spacing.lg },
  forgot: { ...text('bodyMedium', 'semiBold'), color: colors.primary },
  keepText: { ...typography.bodyLarge, color: colors.onSurface },
  error: { ...typography.bodySmall, color: colors.error },
}))
