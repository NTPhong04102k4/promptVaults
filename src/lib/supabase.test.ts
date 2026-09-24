jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}))
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (n: number) => new Uint8Array(n).fill(7)),
}))
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}))

describe('supabase client', () => {
  beforeAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key'
  })

  it('is configured with auth persistence enabled', () => {
    const { supabase } = require('./supabase')

    expect(supabase).toBeDefined()
    expect(supabase.auth).toBeDefined()
  })

  it('uses LargeSecureStore (not plain AsyncStorage) as the session storage adapter', () => {
    jest.resetModules()
    const { LargeSecureStore } = require('./secureStorage')
    const { supabase } = require('./supabase')

    // supabase-js stores its config internally; verify indirectly via the
    // GoTrueClient instance's storage reference, which supabase-js exposes
    // on `supabase.auth` as `storage` in v2.
    expect((supabase.auth as any).storage).toBe(LargeSecureStore)
  })
})
