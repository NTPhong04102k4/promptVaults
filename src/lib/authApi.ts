import { apiClient } from '@/services/apiClient'

import { getDeviceInfo } from './deviceIdentity'
import { normalizeTokens, type RawTokens, setTokens, type StoredTokens } from './tokenStore'

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

// Server-side revoke of ONE specific session — a pure, best-effort network call that never
// throws and never reads or writes the token store. Local sign-out (clearing tokens) is
// authStore.signOut()'s job and happens BEFORE this is even started, so a stalled POST can
// neither delay it nor — when it finally settles, maybe minutes later and after a different
// account signed in — clear anyone's tokens (Task 17 fix round 4). The bearer header is
// passed explicitly instead of `auth: true`: by the time this runs the store is already
// empty, and it must not trigger a refresh or the "session expired" alert either (ruling P6).
export async function revokeSession(tokens: StoredTokens): Promise<void> {
  try {
    await apiClient.post(
      '/auth/logout',
      { refreshToken: tokens.refreshToken },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    )
  } catch {
    // Best effort: offline or already-revoked sessions are already signed out locally.
  }
}
