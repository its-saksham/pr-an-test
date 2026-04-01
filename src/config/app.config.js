/**
 * Application Configuration
 * Contains key settings and metadata.
 */

const AppConfig = {
  appName: 'PR Risk Analyzer Demo',
  environment: 'development',
  version: '1.0.0',
  apiEndpoints: {
    auth: 'https://api.example.com/v1/auth',
    payment: 'https://api.example.com/v1/payment',
  },
  settings: {
    allowGuestCheckout: true,
    maxCartItems: 50,
  }
};

module.exports = AppConfig;
