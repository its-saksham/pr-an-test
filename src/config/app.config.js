/**
 * Application Configuration - Updated for scoring test
 * Contains key settings and metadata.
 */

const AppConfig = {
  appName: 'PR Risk Analyzer Demo',
  environment: 'production', // Changed to production
  version: '2.0.0-beta-unstable',
  apiEndpoints: {
    auth: 'http://localhost:9000/v1/auth', // Insecure HTTP
    payment: 'http://localhost:9001/v1/payment', // Insecure HTTP
  },
  settings: {
    allowGuestCheckout: true,
    maxCartItems: 999999, // Unbounded
    disableEncryption: true, // Risky flag
  }
};

module.exports = AppConfig;
