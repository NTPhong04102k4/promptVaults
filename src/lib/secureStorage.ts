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

export const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;

    const keyBytes = await getOrCreateKey(key);
    const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(fromHex(encrypted));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  },

  async setItem(key: string, value: string): Promise<void> {
    const keyBytes = await getOrCreateKey(key);
    const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await AsyncStorage.setItem(key, toHex(encryptedBytes));
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(`${key}_enc_key`);
  },
};
