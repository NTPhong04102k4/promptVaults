jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (n: number) => new Uint8Array(n).fill(7)),
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      store.delete(k);
    }),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        store.delete(k);
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LargeSecureStore } from './secureStorage';

describe('LargeSecureStore', () => {
  it('round-trips a value through encryption', async () => {
    await LargeSecureStore.setItem('session', 'plaintext-value');
    const result = await LargeSecureStore.getItem('session');
    expect(result).toBe('plaintext-value');
  });

  it('stores ciphertext, not the plaintext, in AsyncStorage', async () => {
    await LargeSecureStore.setItem('session', 'plaintext-value');
    const raw = await AsyncStorage.getItem('session');
    expect(raw).not.toBe('plaintext-value');
    expect(raw).not.toContain('plaintext-value');
  });

  it('returns null for a missing key', async () => {
    const result = await LargeSecureStore.getItem('missing-key');
    expect(result).toBeNull();
  });
});
