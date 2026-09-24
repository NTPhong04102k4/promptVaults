jest.mock('expo-crypto', () => {
  let callCount = 0
  return {
    getRandomBytesAsync: jest.fn(async (n: number) => {
      callCount += 1
      return new Uint8Array(n).fill(callCount)
    }),
  }
})

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>()
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      store.set(k, v)
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      store.delete(k)
    }),
  }
})

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>()
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v)
      }),
      removeItem: jest.fn(async (k: string) => {
        store.delete(k)
      }),
    },
  }
})

import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { LargeSecureStore } from './secureStorage'

describe('LargeSecureStore', () => {
  it('round-trips a value through encryption', async () => {
    await LargeSecureStore.setItem('session', 'plaintext-value')
    const result = await LargeSecureStore.getItem('session')
    expect(result).toBe('plaintext-value')
  })

  it('stores ciphertext, not the plaintext, in AsyncStorage', async () => {
    await LargeSecureStore.setItem('session', 'plaintext-value')
    const raw = await AsyncStorage.getItem('session')
    expect(raw).not.toBe('plaintext-value')
    expect(raw).not.toContain('plaintext-value')
  })

  it('returns null for a missing key', async () => {
    const result = await LargeSecureStore.getItem('missing-key')
    expect(result).toBeNull()
  })

  it('uses a fresh counter for each write, so identical plaintexts produce different ciphertext', async () => {
    await LargeSecureStore.setItem('session', 'same-value')
    const first = await AsyncStorage.getItem('session')
    await LargeSecureStore.setItem('session', 'same-value')
    const second = await AsyncStorage.getItem('session')
    expect(first).not.toBe(second)
  })

  it('removes both the stored value and the encryption key', async () => {
    await LargeSecureStore.setItem('session', 'plaintext-value')
    await LargeSecureStore.removeItem('session')
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('session')
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('session_enc_key')
  })

  it('generates a fresh key after removeItem, not the stale memoized one', async () => {
    await LargeSecureStore.setItem('session', 'first-value')
    await LargeSecureStore.removeItem('session')
    await LargeSecureStore.setItem('session', 'second-value')
    const result = await LargeSecureStore.getItem('session')
    expect(result).toBe('second-value')
  })

  it('returns null instead of throwing when stored data cannot be decrypted', async () => {
    await AsyncStorage.setItem('corrupted', 'not-valid-hex-data-zzz')
    const result = await LargeSecureStore.getItem('corrupted')
    expect(result).toBeNull()
  })
})
