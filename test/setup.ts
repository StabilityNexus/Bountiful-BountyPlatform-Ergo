/**
 * Test setup file - mocks browser globals for Node.js test environment
 */

// Mock window object for Node.js environment
if (typeof global !== 'undefined') {
  (global as any).window = {
    ergo: undefined
  };
}

// Mock Buffer if not available
if (typeof Buffer === 'undefined') {
  global.Buffer = require('buffer').Buffer;
}

