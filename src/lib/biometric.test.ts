jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}))

import * as LocalAuthentication from 'expo-local-authentication'

import { authenticateWithBiometric, isBiometricAvailable } from './biometric'

describe('isBiometricAvailable', () => {
  it('is false when the device has no biometric hardware', async () => {
    ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false)

    expect(await isBiometricAvailable()).toBe(false)
  })

  it('is false when hardware exists but nothing is enrolled', async () => {
    ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true)
    ;(LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false)

    expect(await isBiometricAvailable()).toBe(false)
  })

  it('is true when hardware exists and is enrolled', async () => {
    ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true)
    ;(LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true)

    expect(await isBiometricAvailable()).toBe(true)
  })
})

describe('authenticateWithBiometric', () => {
  it('returns true on success', async () => {
    ;(LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true })

    expect(await authenticateWithBiometric()).toBe(true)
  })

  it('returns false on failure or cancel', async () => {
    ;(LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: false })

    expect(await authenticateWithBiometric()).toBe(false)
  })

  it('returns false instead of throwing if authentication itself errors', async () => {
    ;(LocalAuthentication.authenticateAsync as jest.Mock).mockRejectedValue(
      new Error('no biometrics enrolled'),
    )

    expect(await authenticateWithBiometric()).toBe(false)
  })
})
