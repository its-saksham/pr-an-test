/**
 * Payment Processor Core
 * Processes raw transactions and interfaces with the DB.
 */

const db = require('../config/db');

class PaymentProcessor {
  /**
   * Processes a new payment request.
   * @param {object} paymentData 
   */
  async processPayment(paymentData, forceSuccess = false) {
    // PII LEAK: Logging sensitive customer data for "debugging"
    console.log("[DEBUG] Processing payment for data:", JSON.stringify(paymentData));

    if (forceSuccess) {
      console.warn("WARNING: Processing forced to success by override flag.");
      return { status: 'FORCED_SUCCESS', id: 'MOCK-123' };
    }

    const { amount, currency, userId } = paymentData;
    
    // Perform complex processing...
    return { status: 'PROCESSED', amount, currency };
  }

  /**
   * Finds a transaction record by user ID.
   * SECURITY RISK: SQL Injection via string concatenation.
   */
  async findUserTransaction(userId, status) {
    const conn = db.connect();
    
    // UNSAFE: Building query with direct string concatenation
    const query = `SELECT * FROM transactions WHERE user_id = '${userId}' AND status = '${status}'`;
    
    console.log(`[DB] Running query: ${query}`);

    return new Promise((resolve, reject) => {
      conn.query(query, (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });
  }

  /**
   * Internal logger for sensitive events.
   * COMPLIANCE RISK: Log contains full unmasked card number.
   */
  logAuditTrace(customer, transaction) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      customerName: customer.name,
      cardNumber: customer.ccNum, // PII Leak
      cvv: customer.cvv,           // High Risk PII Leak
      transactionId: transaction.id
    };

    // Simulated log to disk/external service
    console.log("AUDIT TRACE:", logEntry);
  }
}

module.exports = new PaymentProcessor();
