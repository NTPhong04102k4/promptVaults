import { ApiError } from '@/services/apiClient'

import {
  splitFullName,
  toAuthError,
  validateEmail,
  validatePassword,
  validateTemporaryPassword,
  validateUsername,
} from './authForm'

describe('validateEmail', () => {
  it('requires a value and a plausible address', () => {
    expect(validateEmail('')).toBe('Vui lòng nhập email.')
    expect(validateEmail('not-an-email')).toBe('Email không hợp lệ.')
    expect(validateEmail(' a@b.com ')).toBeNull()
  })
})

describe('validatePassword', () => {
  it('enforces the AioKin minimum length (6)', () => {
    expect(validatePassword('')).toBe('Vui lòng nhập mật khẩu.')
    expect(validatePassword('12345')).toMatch(/ít nhất 6/)
    expect(validatePassword('123456')).toBeNull()
  })
})

describe('validateUsername', () => {
  it('allows lowercase letters, digits, "_" and "."', () => {
    expect(validateUsername('an.nguyen_1')).toBeNull()
    expect(validateUsername('An')).not.toBeNull()
    expect(validateUsername('has space')).not.toBeNull()
  })
})

describe('validateTemporaryPassword', () => {
  it('requires the 8-character temporary password AioKin e-mails', () => {
    expect(validateTemporaryPassword('')).toBe('Vui lòng nhập mật khẩu tạm.')
    expect(validateTemporaryPassword('abc')).toBe('Mật khẩu tạm gồm 8 ký tự.')
    expect(validateTemporaryPassword(' Ab12Cd34 ')).toBeNull()
  })
})

describe('splitFullName', () => {
  it('splits on the first space and collapses whitespace', () => {
    expect(splitFullName('  Nguyễn   Văn An ')).toEqual({ firstName: 'Nguyễn', lastName: 'Văn An' })
    expect(splitFullName('Becca')).toEqual({ firstName: 'Becca', lastName: '' })
  })
})

describe('toAuthError', () => {
  const apiError = (code: string, message = 'server message') => new ApiError(400, code, message)

  it('routes AioKin error codes to their field', () => {
    expect(toAuthError(apiError('InvalidCredentials')).field).toBe('password')
    expect(toAuthError(apiError('EmailExists')).field).toBe('email')
    expect(toAuthError(apiError('UsernameExists'))).toEqual({
      field: 'username',
      message: 'Username đã được sử dụng.',
    })
    expect(toAuthError(apiError('InvalidOtp')).field).toBe('code')
    expect(toAuthError(apiError('InvalidTemporaryPassword')).field).toBe('code')
  })

  it('explains an expired registration', () => {
    expect(toAuthError(apiError('RegistrationDataNotFound')).message).toBe(
      'Phiên đăng ký đã hết hạn, vui lòng đăng ký lại.',
    )
  })

  it('shows the server message for validation and conflict errors', () => {
    expect(toAuthError(apiError('ValidationError', 'Mat khau toi thieu 6 ky tu.'))).toEqual({
      field: 'form',
      message: 'Mat khau toi thieu 6 ky tu.',
    })
    expect(toAuthError(apiError('Conflict', 'Du lieu xung dot.'))).toEqual({
      field: 'form',
      message: 'Du lieu xung dot.',
    })
  })

  it('shows the server message for TooManyRequests, falling back to fixed text (P7)', () => {
    expect(toAuthError(apiError('TooManyRequests', 'Thu lai sau 30 giay.'))).toEqual({
      field: 'form',
      message: 'Thu lai sau 30 giay.',
    })
    expect(toAuthError(new ApiError(429, 'TooManyRequests', ''))).toEqual({
      field: 'form',
      message: 'Bạn thao tác quá nhanh, thử lại sau ít phút.',
    })
  })

  it('reports being offline', () => {
    expect(toAuthError(new ApiError(0, 'network', 'x')).message).toBe('Không có kết nối mạng.')
  })

  it('falls back to a generic form error', () => {
    expect(toAuthError(new Error('boom'))).toEqual({
      field: 'form',
      message: 'Có lỗi xảy ra, thử lại sau.',
    })
  })
})
