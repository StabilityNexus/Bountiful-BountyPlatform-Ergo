export default {
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.json'
    }],
    '^.+\\.es$': '<rootDir>/test/rawEsTransform.cjs'
  },
  moduleNameMapper: {
    '^(.*\\.es)\\?raw$': '$1',
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1'
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@fleet-sdk/.*)/)"
  ],
};
