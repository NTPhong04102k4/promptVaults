import {
  splitFullName,
  toAuthError,
  validateEmail,
  validatePassword,
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
  it('enforces the Supabase minimum length', () => {
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

describe('splitFullName', () => {
  it('splits on the first space and collapses whitespace', () => {
    expect(splitFullName('  Nguyễn   Văn An ')).toEqual({ firstName: 'Nguyễn', lastName: 'Văn An' })
    expect(splitFullName('Becca')).toEqual({ firstName: 'Becca', lastName: '' })
  })
})

describe('toAuthError', () => {
  it('routes known Supabase codes to their field', () => {
    expect(toAuthError(new Error('invalid_credentials')).field).toBe('password')
    expect(toAuthError(new Error('user_already_exists')).field).toBe('email')
    expect(toAuthError(new Error('otp_expired')).field).toBe('code')
  })

  it('detects a username unique-constraint violation', () => {
    const error = new Error(
      'duplicate key value violates unique constraint "profiles_username_key"',
    )
    expect(toAuthError(error)).toEqual({ field: 'username', message: 'Username đã được sử dụng.' })
  })

  it('falls back to a generic form error', () => {
    expect(toAuthError(new Error('boom'))).toEqual({
      field: 'form',
      message: 'Có lỗi xảy ra, thử lại sau.',
    })
  })
})
