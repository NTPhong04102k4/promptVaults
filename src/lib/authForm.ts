// Client-side validation + user-facing messages for the onboarding auth screens.

import { ApiError } from '@/services/apiClient'

export const MIN_PASSWORD_LENGTH = 6 // AioKin LoginRequest/RegisterRequest MinLength(6)

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

// AioKin ResetPasswordRequest.TemporaryPassword is StringLength(8, MinimumLength = 8).
export function validateTemporaryPassword(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Vui lòng nhập mật khẩu tạm.'
  return trimmed.length === 8 ? null : 'Mật khẩu tạm gồm 8 ký tự.'
}

// "Nguyễn Văn An" → firstName "Nguyễn", lastName "Văn An". Stored as-is; display joins them back.
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = fullName.trim().split(/\s+/)
  return { firstName, lastName: rest.join(' ') }
}

export type AuthErrorField = 'email' | 'password' | 'username' | 'code' | 'form'

// Keys are AioKin OperationResult.errorCode values (AuthController / OperationResultHttpExtensions).
const AUTH_ERRORS: Record<string, { field: AuthErrorField; message: string }> = {
  EmailExists: { field: 'email', message: 'Email này đã được đăng ký.' },
  UsernameExists: { field: 'username', message: 'Username đã được sử dụng.' },
  InvalidCredentials: { field: 'password', message: 'Thông tin đăng nhập không đúng.' },
  AccountLocked: {
    field: 'form',
    message: 'Tài khoản đang bị khoá tạm thời do nhập sai nhiều lần, thử lại sau ít phút.',
  },
  UserInactive: { field: 'form', message: 'Tài khoản đã bị vô hiệu hoá.' },
  InvalidOtp: { field: 'code', message: 'Mã không đúng hoặc đã hết hạn.' },
  InvalidTemporaryPassword: { field: 'code', message: 'Mật khẩu tạm không đúng hoặc đã hết hạn.' },
  RegistrationDataNotFound: {
    field: 'form',
    message: 'Phiên đăng ký đã hết hạn, vui lòng đăng ký lại.',
  },
  EmailSendFailed: { field: 'form', message: 'Không gửi được email, thử lại sau.' },
  OtpGenerationFailed: { field: 'form', message: 'Không gửi được email, thử lại sau.' },
  network: { field: 'form', message: 'Không có kết nối mạng.' },
}

// Codes whose server message is the most useful thing to show.
const SERVER_MESSAGE_CODES = new Set(['ValidationError', 'Conflict'])

// Fixed Vietnamese fallback for 429s that arrive with no usable server message (ruling P7).
const TOO_MANY_REQUESTS_FALLBACK = 'Bạn thao tác quá nhanh, thử lại sau ít phút.'

export function toAuthError(error: unknown): { field: AuthErrorField; message: string } {
  if (error instanceof ApiError) {
    // TooManyRequests (429): prefer the server's message when present, else the fixed
    // fallback text (ruling P7, spec §13 binding) — not a static AUTH_ERRORS entry.
    if (error.code === 'TooManyRequests') {
      return {
        field: 'form',
        message: error.message.trim() ? error.message : TOO_MANY_REQUESTS_FALLBACK,
      }
    }
    const known = AUTH_ERRORS[error.code]
    if (known) return known
    if (SERVER_MESSAGE_CODES.has(error.code)) return { field: 'form', message: error.message }
  }
  return { field: 'form', message: 'Có lỗi xảy ra, thử lại sau.' }
}
