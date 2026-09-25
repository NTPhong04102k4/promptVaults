import { useState } from 'react'
import { Text, View } from 'react-native'
import { Image } from 'expo-image'

import googleLogo from '@/assets/images/google.svg'
import { AuthLayout, Button, Checkbox, FooterPrompt, OrDivider, TextField } from '@/components/ui'
import { getSession, signInWithGoogle, signUpWithEmail } from '@/lib/auth'
import {
  type AuthErrorField,
  splitFullName,
  toAuthError,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/lib/authForm'
import { replace } from '@/navigation'
import { makeStyles } from '@/theme'

type Field = 'fullName' | 'confirm' | 'terms' | AuthErrorField
type Errors = Partial<Record<Field, string>>

export default function SignupScreen() {
  const styles = useStyles()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(false)

  function validate(): Errors {
    const next: Errors = {}
    if (!fullName.trim()) next.fullName = 'Vui lòng nhập họ tên.'
    const usernameError = validateUsername(username)
    if (usernameError) next.username = usernameError
    const emailError = validateEmail(email)
    if (emailError) next.email = emailError
    const passwordError = validatePassword(password)
    if (passwordError) next.password = passwordError
    if (confirm !== password) next.confirm = 'Mật khẩu nhập lại không khớp.'
    if (!accepted) next.terms = 'Bạn cần đồng ý điều khoản để tiếp tục.'
    return next
  }

  async function handleSignup() {
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    try {
      const { needsVerification } = await signUpWithEmail({
        email: email.trim(),
        password,
        username,
        ...splitFullName(fullName),
      })
      if (needsVerification) replace('verifyEmail', { email: email.trim() })
      else replace('sync')
    } catch (e) {
      const { field, message } = toAuthError(e)
      setErrors({ [field]: message })
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
    <AuthLayout title="Đăng ký">
      <Button
        variant="tonal"
        label="Đăng ký với Google"
        icon={<Image source={googleLogo} style={styles.googleLogo} />}
        onPress={handleGoogle}
        disabled={loading}
      />

      <OrDivider label="hoặc đăng ký bằng email" />

      <View style={styles.fields}>
        <TextField
          label="Họ và tên"
          placeholder="Nguyễn Văn An"
          autoComplete="name"
          textContentType="name"
          value={fullName}
          onChangeText={setFullName}
          error={errors.fullName}
        />
        <TextField
          label="Username"
          placeholder="annguyen"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          value={username}
          onChangeText={(value) => setUsername(value.toLowerCase())}
          error={errors.username}
        />
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
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
        />
        <TextField
          label="Nhập lại mật khẩu"
          placeholder="••••••••"
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
        />
      </View>

      <View style={styles.terms}>
        <Checkbox
          checked={accepted}
          onChange={setAccepted}
          accessibilityLabel="Đồng ý điều khoản sử dụng và chính sách bảo mật"
        >
          <Text style={styles.termsText}>
            Khi tạo tài khoản, tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật của
            PromptVault
          </Text>
        </Checkbox>
        {errors.terms && <Text style={styles.error}>{errors.terms}</Text>}
      </View>

      {errors.form && <Text style={styles.error}>{errors.form}</Text>}

      <Button label="Đăng ký" onPress={handleSignup} loading={loading} />

      <FooterPrompt
        prompt="Đã có tài khoản?"
        action="Đăng nhập tại đây"
        onPress={() => replace('login', { email: email.trim() })}
      />
    </AuthLayout>
  )
}

const useStyles = makeStyles(({ colors, typography, spacing }) => ({
  googleLogo: { width: 20, height: 20 },
  fields: { gap: spacing.lg },
  terms: { gap: spacing.xs },
  termsText: { ...typography.bodySmall, color: colors.onSurfaceVariant },
  error: { ...typography.bodySmall, color: colors.error },
}))
