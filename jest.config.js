const jestExpoPreset = require('jest-expo/jest-preset');
const path = require('path');

module.exports = {
  ...jestExpoPreset,
  testEnvironment: 'node',
  // Override setupFilesAfterEnv to prevent loading react-native setup
  setupFilesAfterEnv: [],
  moduleNameMapper: {
    ...(jestExpoPreset.moduleNameMapper || {}),
    '^expo-sqlite$': path.join(__dirname, '__mocks__', 'expo-sqlite.js'),
  },
};
