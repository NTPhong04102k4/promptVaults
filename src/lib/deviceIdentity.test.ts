let mockUuidCounter = 0
jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${(mockUuidCounter += 1)}`,
}))
jest.mock('expo-device', () => ({ deviceName: 'Pixel của An', modelName: 'Pixel 8' }))

import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

import { getDeviceId, getDeviceInfo, resetDeviceIdCacheForTests } from './deviceIdentity'

// expo-secure-store is auto-mocked from __mocks__/expo-secure-store.js (see ruling P16);
// its backing Map is exposed as __store so we can seed/inspect it directly.
const mockSecure = (SecureStore as unknown as { __store: Map<string, string> }).__store

beforeEach(() => {
  mockSecure.clear()
  resetDeviceIdCacheForTests()
})

describe('deviceIdentity', () => {
  it('generates the id once and reuses it', async () => {
    const first = await getDeviceId()
    const second = await getDeviceId()
    expect(first).toBe(second)
    expect(mockSecure.get('aiokin.deviceId')).toBe(first)
  })

  it('reads a previously stored id after a restart', async () => {
    mockSecure.set('aiokin.deviceId', 'persisted-id')
    expect(await getDeviceId()).toBe('persisted-id')
  })

  it('reports name and platform', async () => {
    const info = await getDeviceInfo()
    expect(info.deviceName).toBe('Pixel của An')
    expect(info.platform).toBe(Platform.OS)
  })
})
