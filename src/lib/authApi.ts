import { apiClient } from '@/services/apiClient'

import { getDeviceInfo } from './deviceIdentity'
import { clearTokens, getTokens, normalizeTokens, type RawTokens, setTokens } from './tokenStore'

// camelCase of AioKin's LoginResponse (Models/ViewModel/Auth/User/LoginResponse.cs).
// userCode is not returned today — spec gap G2.
export type AccountProfile = {
  userID: string
  userCode?: string | null
  firstName: string | null
  lastName: string | null
  fullName: string | null
  email: string | null
  username: string
  image: string | null
  socialProvider: string | null
  hasPassword: boolean
}

type VerifyOtpData = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
  user: AccountProfile
}

export async function register(input: {
  username: string
  email: string
  password: string
}): Promise<void> {
  await apiClient.post('/auth/register', input)
}

export async function verifyOtp(email: string, otpCode: string): Promise<AccountProfile> {
  const device = await getDeviceInfo()
  const data = await apiClient.post<VerifyOtpData>('/auth/verify-otp', {
    email,
    otpCode,
    ...device,
  })
  await setTokens(normalizeTokens(data))
  return data.user
}

export async function resendOtp(email: string): Promise<void> {
  await apiClient.post('/auth/resend-otp', { email })
}

export async function login(usernameOrPhoneOrEmail: string, password: string): Promise<void> {
  const device = await getDeviceInfo()
  const raw = await apiClient.post<RawTokens>(
    '/auth/login',
    { usernameOrPhoneOrEmail, password, ...device },
    { envelope: false },
  )
  await setTokens(normalizeTokens(raw))
}

export async function forgotPassword(email: string): Promise<void> {
  await apiClient.post('/auth/forgot-password', { email })
}

export async function verifyPasswordOtp(
  email: string,
  otpCode: string,
): Promise<{ step: string; expiresInMinutes: number }> {
  return apiClient.post('/auth/forgot-password/verify-otp', { email, otpCode })
}

export async function resetPassword(
  email: string,
  temporaryPassword: string,
  newPassword: string,
): Promise<void> {
  await apiClient.post('/auth/reset-password', { email, temporaryPassword, newPassword })
}

export async function getMe(): Promise<AccountProfile> {
  return apiClient.get<AccountProfile>('/account/me', { auth: true })
}

export async function updateMe(patch: { firstName?: string; lastName?: string }): Promise<void> {
  await apiClient.patch('/account/me', patch, { auth: true })
}

export async function logout(): Promise<void> {
  const tokens = await getTokens()
  try {
    if (tokens) {
      // skipAuthRefresh: an explicit sign-out with an already-dead session must not
      // trigger a refresh attempt or the "session expired" alert (ruling P6).
      await apiClient.post(
        '/auth/logout',
        { refreshToken: tokens.refreshToken },
        { auth: true, skipAuthRefresh: true },
      )
    }
  } catch {
    // Best effort: offline or already-revoked sessions still sign out locally.
  } finally {
    await clearTokens('signout')
  }
}
