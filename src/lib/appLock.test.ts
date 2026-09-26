jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>()
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v)
      }),
    },
  }
})

import { isAppLockEnabled, setAppLockEnabled } from './appLock'

describe('appLock', () => {
  it('defaults to disabled', async () => {
    expect(await isAppLockEnabled()).toBe(false)
  })

  it('persists true after being enabled', async () => {
    await setAppLockEnabled(true)
    expect(await isAppLockEnabled()).toBe(true)
  })

  it('persists false after being disabled again', async () => {
    await setAppLockEnabled(true)
    await setAppLockEnabled(false)
    expect(await isAppLockEnabled()).toBe(false)
  })
})
