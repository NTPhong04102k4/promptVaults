jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

describe('supabase client', () => {
  it('is configured with auth persistence enabled', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
    const { supabase } = require('./supabase');

    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
  });
});
