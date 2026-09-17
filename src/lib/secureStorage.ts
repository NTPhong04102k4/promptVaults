import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as aesjs from 'aes-js';

function toHex(bytes: Uint8Array): string {
  return aesjs.utils.hex.fromBytes(bytes);
}

function fromHex(hex: string): Uint8Array {
  return aesjs.utils.hex.toBytes(hex);
}

async function getOrCreateKey(storageKey: string): Promise<Uint8Array> {
  const keyName = `${storageKey}_enc_key`;
  const existing = await SecureStore.getItemAsync(keyName);
  if (existing) return fromHex(existing);

  const key = await Crypto.getRandomBytesAsync(32);
  await SecureStore.setItemAsync(keyName, toHex(key));
  return key;
}

const COUNTER_HEX_LENGTH = 32; // 16 bytes, hex-encoded

export const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;

    const counterHex = stored.slice(0, COUNTER_HEX_LENGTH);
    const cipherHex = stored.slice(COUNTER_HEX_LENGTH);
    const keyBytes = await getOrCreateKey(key);
    const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(fromHex(counterHex)));
    const decryptedBytes = cipher.decrypt(fromHex(cipherHex));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  },

  async setItem(key: string, value: string): Promise<void> {
    const keyBytes = await getOrCreateKey(key);
    const counterBytes = await Crypto.getRandomBytesAsync(16);
    const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(counterBytes));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await AsyncStorage.setItem(key, toHex(counterBytes) + toHex(encryptedBytes));
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(`${key}_enc_key`);
  },
};
