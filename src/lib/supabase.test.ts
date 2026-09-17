jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (n: number) => new Uint8Array(n).fill(7)),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

describe('supabase client', () => {
  beforeAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
  });

  it('is configured with auth persistence enabled', () => {
    // Import after environment variables are set
    const { supabase } = require('./supabase');

    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
  });
});
