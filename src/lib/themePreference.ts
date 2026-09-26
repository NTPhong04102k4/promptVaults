import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemePreference } from '@/theme/resolveScheme';

const THEME_PREFERENCE_KEY = 'themePreference';

export async function getThemePreference(): Promise<ThemePreference> {
  const value = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

export async function setThemePreference(pref: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, pref);
}
