const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*']),
  expoConfig,
  {
    // Jest hoists jest.mock() above imports regardless of source order, so this
    // codebase places jest.mock() calls first for readability; and some tests
    // need require() + jest.resetModules() to get a fresh module instance after
    // changing env vars, which static imports can't express.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'import/first': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
