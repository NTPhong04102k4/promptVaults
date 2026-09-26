const { defineConfig, globalIgnores } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')
const prettierConfig = require('eslint-config-prettier/flat')
const neostandard = require('neostandard')

module.exports = defineConfig([
  // .claude/worktrees holds other branches' checkouts; linting them would --fix another branch.
  globalIgnores(['dist/*', 'android/*', 'ios/*', '.expo/*', '.claude/**']),
  expoConfig,
  // Standard's code-quality rules only; formatting is Prettier's job (`noStyle`).
  // `ts: true` lints .ts/.tsx; `noJsx` skips its React plugin since expo already registers it.
  // neostandard bundles its own copy of @typescript-eslint, which flat config refuses to
  // register twice, so drop it and let its rules resolve against expo's instance.
  ...neostandard({ ts: true, noJsx: true, noStyle: true }).map(({ plugins, ...config }) => {
    if (!plugins) return config
    const { '@typescript-eslint': _duplicate, ...rest } = plugins
    return { ...config, plugins: rest }
  }),
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'react-hooks/exhaustive-deps': 'error',
      // A–Z for the names inside `{ ... }`; line order is left to import/order below.
      'sort-imports': ['error', { ignoreCase: true, ignoreDeclarationSort: true }],
      // Import priority: react → react-native → expo → other packages → @/ aliases →
      // relative paths, one blank line between groups, A–Z inside each group.
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object'],
          pathGroups: [
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: 'react-native', group: 'external', position: 'before' },
            { pattern: '{expo,expo-*,@expo/**}', group: 'external', position: 'before' },
            { pattern: '@/**', group: 'internal' },
          ],
          pathGroupsExcludedImportTypes: ['react', 'react-native'],
          distinctGroup: false,
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    // expo only registers @typescript-eslint for TS files.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Jest hoists jest.mock() above imports regardless of source order, so this
    // codebase places jest.mock() calls first for readability; and some tests
    // need require() + jest.resetModules() to get a fresh module instance after
    // changing env vars, which static imports can't express.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'import/first': 'off',
      'import-x/first': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Must stay last: turns off any remaining rule that would fight Prettier's formatting.
  prettierConfig,
])
