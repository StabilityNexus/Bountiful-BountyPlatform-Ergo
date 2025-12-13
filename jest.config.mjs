export default {
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: false, // Don't use tsconfig, use inline options
      isolatedModules: true,
      compilerOptions: {
        module: 'ESNext',
        target: 'ES2020',
        esModuleInterop: true,
        skipLibCheck: true,
        allowJs: true,
        strict: false,
        noImplicitAny: false
      }
    }],
    '^.+\\.es$': '<rootDir>/test/fileMock.cjs'
  },
  moduleNameMapper: {
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1'
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@fleet-sdk/.*)/)"
  ],
  // Don't type-check source files during tests
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.svelte'
  ]
};
