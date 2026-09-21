jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
    },
  };
});

import { getThemePreference, setThemePreference } from './themePreference';

describe('themePreference', () => {
  it('defaults to system', async () => {
    expect(await getThemePreference()).toBe('system');
  });

  it('persists light after being set', async () => {
    await setThemePreference('light');
    expect(await getThemePreference()).toBe('light');
  });

  it('persists dark after being set again', async () => {
    await setThemePreference('light');
    await setThemePreference('dark');
    expect(await getThemePreference()).toBe('dark');
  });
});
