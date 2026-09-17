import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_LOCK_KEY = 'appLockEnabled';

export async function isAppLockEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(APP_LOCK_KEY);
  return value === 'true';
}

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(APP_LOCK_KEY, enabled ? 'true' : 'false');
}
