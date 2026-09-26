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

// Luong native (RN Google Sign-In SDK): id_token da lay san tu Google, server tu verify —
// khac voi luong WebView (Huong B) o oauthWebLogin.ts. Endpoint tra ve TokenResponse tho
// (envelope:false), giong /auth/login.
export async function loginWithGoogleNative(idToken: string): Promise<void> {
  const device = await getDeviceInfo()
  const raw = await apiClient.post<RawTokens>(
    '/auth/login/google/native',
    { idToken, ...device },
    { envelope: false },
  )
  await setTokens(normalizeTokens(raw))
}

// Luong native (RN FBSDK): access token da lay san tu Facebook, server tu verify qua
// debug_token — khac voi luong WebView (Huong B) o oauthWebLogin.ts.
export async function loginWithFacebookNative(accessToken: string): Promise<void> {
  const device = await getDeviceInfo()
  const raw = await apiClient.post<RawTokens>(
    '/auth/login/facebook/native',
    { accessToken, ...device },
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

// Server revokes every other session on success (ChangePasswordRequest doc comment) — this
// device's own tokens stay valid since they were just used to authenticate the call.
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/account/me/change-password', { currentPassword, newPassword }, { auth: true })
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
