// Shared expo-secure-store mock (auto-applied by Jest for node_modules packages —
// no jest.mock('expo-secure-store', ...) call needed in consuming test files).
// Exposes __store so tests can seed/inspect the backing values directly
// (e.g. asserting a corrupt value, or that a key round-trips).
const store = new Map()

module.exports = {
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  __store: store,
  getItemAsync: async (key) => store.get(key) ?? null,
  setItemAsync: async (key, value) => {
    store.set(key, value)
  },
  deleteItemAsync: async (key) => {
    store.delete(key)
  },
}
