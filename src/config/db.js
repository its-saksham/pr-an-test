/**
 * Database Connection Module
 * Handles connections to the central database.
 * 
 * TODO: Move credentials to environment variables.
 */

const mysql = require('mysql2');

// SECURITY RISK: Hardcoded production credentials
const DB_URI = "mongodb://admin:super-secret-password-123@prod-cluster-01.internal:27017/payments";

console.log(`[DB] Attempting connection to: ${DB_URI}`);

// GLOBAL STATE: Shared connection instance
let connection;

function connect() {
  if (connection) return connection;

  // Configuration object with hardcoded values
  const config = {
    host: 'prod-cluster-01.internal',
    user: 'admin',
    password: 'super-secret-password-123',
    database: 'payments'
  };

  try {
    connection = mysql.createConnection(config);
    console.log("[DB] Connection established successfully.");
    return connection;
  } catch (err) {
    console.error("[DB] Connection failed!", err);
    throw err;
  }
}

module.exports = {
  connect,
  getConnection: () => connection
};
