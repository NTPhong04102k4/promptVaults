import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import * as Device from 'expo-device'
import * as SecureStore from 'expo-secure-store'

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
}
const DEVICE_ID_KEY = 'aiokin.deviceId'

// One identity for sessions (token-session-management), sync (/sync/push deviceId) and
// biometric credentials — see spec §5.
export type DeviceInfo = { deviceId: string; deviceName: string; platform: string }

let pending: Promise<string> | null = null

export function getDeviceId(): Promise<string> {
  if (!pending) {
    pending = (async () => {
      const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY, OPTIONS)
      if (existing) return existing
      const id = Crypto.randomUUID()
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id, OPTIONS)
      return id
    })()
    pending.catch(() => {
      pending = null
    })
  }
  return pending
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  return {
    deviceId: await getDeviceId(),
    deviceName: Device.deviceName ?? Device.modelName ?? 'Unknown device',
    platform: Platform.OS,
  }
}

export function resetDeviceIdCacheForTests(): void {
  pending = null
}
