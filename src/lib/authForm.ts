// Client-side validation + user-facing messages for the onboarding auth screens.

export const MIN_PASSWORD_LENGTH = 6 // Supabase default minimum

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Vui lòng nhập email.'
  return EMAIL_PATTERN.test(email.trim()) ? null : 'Email không hợp lệ.'
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Vui lòng nhập mật khẩu.'
  return password.length >= MIN_PASSWORD_LENGTH
    ? null
    : `Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`
}

export function validateUsername(username: string): string | null {
  if (!username) return 'Vui lòng nhập username.'
  return USERNAME_PATTERN.test(username)
    ? null
    : 'Username 3–30 ký tự, chỉ gồm chữ thường, số, "_" hoặc ".".'
}

// "Nguyễn Văn An" → firstName "Nguyễn", lastName "Văn An". Stored as-is; display joins them back.
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = fullName.trim().split(/\s+/)
  return { firstName, lastName: rest.join(' ') }
}

export type AuthErrorField = 'email' | 'password' | 'username' | 'code' | 'form'

const AUTH_ERRORS: Record<string, { field: AuthErrorField; message: string }> = {
  user_already_exists: { field: 'email', message: 'Email này đã được đăng ký.' },
  invalid_credentials: { field: 'password', message: 'Email hoặc mật khẩu không đúng.' },
  email_not_confirmed: { field: 'form', message: 'Email chưa được xác minh.' },
  otp_expired: { field: 'code', message: 'Mã không đúng hoặc đã hết hạn.' },
  over_email_send_rate_limit: {
    field: 'form',
    message: 'Bạn thao tác quá nhanh, thử lại sau ít phút.',
  },
  weak_password: { field: 'password', message: 'Mật khẩu quá yếu.' },
}

// Maps a Supabase error code (thrown by src/lib/auth) to the field it belongs to.
export function toAuthError(error: unknown): { field: AuthErrorField; message: string } {
  const code = error instanceof Error ? error.message : String(error)
  if (code.includes('duplicate key') && code.includes('username')) {
    return { field: 'username', message: 'Username đã được sử dụng.' }
  }
  return AUTH_ERRORS[code] ?? { field: 'form', message: 'Có lỗi xảy ra, thử lại sau.' }
}
