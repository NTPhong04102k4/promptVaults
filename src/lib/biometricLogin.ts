import * as SecureStore from 'expo-secure-store'
import {
  createKeys,
  deleteKeys,
  InputEncoding,
  signWithOptions,
} from '@sbaiahmed1/react-native-biometrics'

import { apiClient, ApiError } from '@/services/apiClient'

import { ensureDerSignature } from './biometricSignature'
import { getDeviceId, getDeviceInfo } from './deviceIdentity'
import { setOAuthInProgress } from './oauthState'
import { normalizeTokens, type RawTokens, setTokens } from './tokenStore'

// Biometric LOGIN (server challenge/response, biometric-device-login plan). Unrelated to
// the local app lock in appLock.ts / biometric.ts.
const KEY_ALIAS = 'aiokin.biometric'
const ENROLLMENT_KEY = 'aiokin.biometricLogin'
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }

export type BiometricEnrollment = { userCode: string; email: string | null }

export async function getBiometricEnrollment(): Promise<BiometricEnrollment | null> {
  const stored = await SecureStore.getItemAsync(ENROLLMENT_KEY, OPTIONS)
  try {
    return stored ? (JSON.parse(stored) as BiometricEnrollment) : null
  } catch {
    return null
  }
}

export async function enableBiometricLogin(user: {
  userCode: string | null
  email: string | null
}): Promise<void> {
  if (!user.userCode) throw new Error('user_code_unavailable') // profile not loaded yet
  // EC P-256 in Secure Enclave / Android Keystore, biometric-gated per use.
  const { publicKey } = await createKeys(KEY_ALIAS, 'ec256')
  const device = await getDeviceInfo()
  try {
    // deviceId must be the one this session was issued for (sent at login) — the server
    // compares it with the session and answers 403 otherwise (spec §0 C26).
    await apiClient.post(
      '/auth/biometric/register',
      { ...device, deviceName: device.deviceName.slice(0, 120), publicKey },
      { auth: true },
    )
  } catch (error) {
    await deleteKeys(KEY_ALIAS) // never keep a key the server doesn't know
    if (error instanceof ApiError && error.status === 403) throw new Error('biometric_device_mismatch')
    throw error // 400 InvalidPublicKey (not P-256 SPKI), network, …
  }
  const enrollment: BiometricEnrollment = { userCode: user.userCode, email: user.email }
  await SecureStore.setItemAsync(ENROLLMENT_KEY, JSON.stringify(enrollment), OPTIONS)
}

export async function disableBiometricLogin(): Promise<void> {
  try {
    await apiClient.delete(`/auth/biometric/${encodeURIComponent(await getDeviceId())}`, { auth: true })
  } catch {
    // Best effort (404 = already revoked server-side, e.g. by logout-all): the local key is
    // deleted anyway, so this device can no longer sign. Revoking our own device does not
    // sign us out (spec §0 C28).
  }
  await deleteKeys(KEY_ALIAS)
  await SecureStore.deleteItemAsync(ENROLLMENT_KEY, OPTIONS)
}

export async function forgetBiometricForOtherUser(userCode: string | null): Promise<void> {
  const enrollment = await getBiometricEnrollment()
  if (enrollment && enrollment.userCode !== userCode) {
    await deleteKeys(KEY_ALIAS)
    await SecureStore.deleteItemAsync(ENROLLMENT_KEY, OPTIONS)
  }
}

export async function signInWithBiometric(): Promise<'signed_in' | 'cancelled'> {
  const enrollment = await getBiometricEnrollment()
  if (!enrollment) throw new Error('biometric_not_enrolled')

  // OperationResult envelope — BiometricController.Challenge → ToActionResult (spec §0 C25).
  const challenge = await apiClient.post<{ challengeId: string; nonce: string }>(
    '/auth/biometric/challenge',
    { userCode: enrollment.userCode, deviceId: await getDeviceId() },
  )

  setOAuthInProgress(true) // the OS prompt backgrounds the app; don't trigger app lock
  let result: { success: boolean; signature?: string }
  try {
    result = await signWithOptions({
      keyAlias: KEY_ALIAS,
      data: challenge.nonce, // server signs Convert.FromBase64String(nonce) → sign the bytes
      inputEncoding: InputEncoding.Base64,
      promptTitle: 'Đăng nhập PromptVault',
      cancelButtonText: 'Huỷ',
      disableDeviceFallback: true,
    })
  } finally {
    setOAuthInProgress(false)
  }
  if (!result.success || !result.signature) return 'cancelled'

  // Envelope whose data is the snake_case TokenResponse.
  const tokens = await apiClient.post<RawTokens>('/auth/biometric/verify', {
    challengeId: challenge.challengeId,
    signature: ensureDerSignature(result.signature),
  })
  await setTokens(normalizeTokens(tokens))
  return 'signed_in'
}
