const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: async (key: string) => mockSecure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecure.set(key, value)
  },
  deleteItemAsync: async (key: string) => {
    mockSecure.delete(key)
  },
}))
jest.mock('@sbaiahmed1/react-native-biometrics', () => ({
  createKeys: jest.fn(async () => ({ publicKey: 'SPKI-BASE64' })),
  deleteKeys: jest.fn(async () => ({ success: true })),
  signWithOptions: jest.fn(),
  InputEncoding: { Base64: 'base64' },
}))
jest.mock('@/services/apiClient', () => {
  class ApiError extends Error {
    status: number
    code: string
    constructor(status: number, code: string, message: string) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  return { ApiError, apiClient: { post: jest.fn(), delete: jest.fn() } }
})
jest.mock('./deviceIdentity', () => ({
  getDeviceId: async () => 'dev-1',
  getDeviceInfo: async () => ({ deviceId: 'dev-1', deviceName: 'Pixel', platform: 'android' }),
}))
jest.mock('./biometricSignature', () => ({ ensureDerSignature: (s: string) => `der(${s})` }))

import { deleteKeys, signWithOptions } from '@sbaiahmed1/react-native-biometrics'

import { apiClient, ApiError } from '@/services/apiClient'

import {
  disableBiometricLogin,
  enableBiometricLogin,
  forgetBiometricForOtherUser,
  getBiometricEnrollment,
  signInWithBiometric,
} from './biometricLogin'
import { getTokens, resetTokenCacheForTests } from './tokenStore'

const post = apiClient.post as jest.Mock

beforeEach(() => {
  mockSecure.clear()
  resetTokenCacheForTests()
  jest.clearAllMocks()
})

describe('biometricLogin', () => {
  it('enable registers the public key for this device', async () => {
    await enableBiometricLogin({ userCode: 'USR_1', email: 'a@b.com' })
    expect(post).toHaveBeenCalledWith(
      '/auth/biometric/register',
      { deviceId: 'dev-1', deviceName: 'Pixel', platform: 'android', publicKey: 'SPKI-BASE64' },
      { auth: true },
    )
    expect(await getBiometricEnrollment()).toEqual({ userCode: 'USR_1', email: 'a@b.com' })
  })

  it('refuses to enable without a userCode', async () => {
    await expect(enableBiometricLogin({ userCode: null, email: null })).rejects.toThrow('user_code_unavailable')
  })

  it('a 403 on register (session bound to another deviceId) deletes the key and reports it', async () => {
    post.mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'Chi duoc dang ky sinh trac cho chinh thiet bi...'))
    await expect(enableBiometricLogin({ userCode: 'USR_1', email: null })).rejects.toThrow('biometric_device_mismatch')
    expect(deleteKeys).toHaveBeenCalledWith('aiokin.biometric')
    expect(await getBiometricEnrollment()).toBeNull()
  })

  it('signs the nonce and stores the tokens from the envelope', async () => {
    await enableBiometricLogin({ userCode: 'USR_1', email: null })
    post.mockReset()
    post
      .mockResolvedValueOnce({ challengeId: 'ch-1', nonce: 'NONCE' }) // envelope data, unwrapped by apiClient
      .mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r', expires_in: 900 })
    ;(signWithOptions as jest.Mock).mockResolvedValue({ success: true, signature: 'SIG' })

    await expect(signInWithBiometric()).resolves.toBe('signed_in')

    // Envelope endpoint (spec §0 C25): default options, no `envelope: false`.
    expect(post).toHaveBeenNthCalledWith(1, '/auth/biometric/challenge', {
      userCode: 'USR_1',
      deviceId: 'dev-1',
    })
    expect(signWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({ keyAlias: 'aiokin.biometric', data: 'NONCE', inputEncoding: 'base64' }),
    )
    expect(post).toHaveBeenNthCalledWith(2, '/auth/biometric/verify', { challengeId: 'ch-1', signature: 'der(SIG)' })
    expect((await getTokens())?.accessToken).toBe('a')
  })

  it('returns cancelled when the user dismisses the OS prompt', async () => {
    await enableBiometricLogin({ userCode: 'USR_1', email: null })
    post.mockReset().mockResolvedValueOnce({ challengeId: 'ch-1', nonce: 'NONCE' })
    ;(signWithOptions as jest.Mock).mockResolvedValue({ success: false, error: 'cancelled' })

    await expect(signInWithBiometric()).resolves.toBe('cancelled')
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('disable revokes on the server and deletes the key even when offline', async () => {
    await enableBiometricLogin({ userCode: 'USR_1', email: null })
    ;(apiClient.delete as jest.Mock).mockRejectedValue(new Error('offline'))

    await disableBiometricLogin()

    expect(apiClient.delete).toHaveBeenCalledWith('/auth/biometric/dev-1', { auth: true })
    expect(deleteKeys).toHaveBeenCalledWith('aiokin.biometric')
    expect(await getBiometricEnrollment()).toBeNull()
  })

  it("forgets another account's enrollment", async () => {
    await enableBiometricLogin({ userCode: 'USR_1', email: null })
    await forgetBiometricForOtherUser('USR_2')
    expect(await getBiometricEnrollment()).toBeNull()
  })
})
