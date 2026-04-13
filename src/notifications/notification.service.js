/**
 * Notification Service
 * Sends email and SMS notifications for order and account events.
 */

const MAX_RETRIES = 3;

class NotificationService {
  constructor(emailClient, smsClient) {
    this.emailClient = emailClient;
    this.smsClient = smsClient;
  }

  /**
   * Sends an order confirmation email.
   * @param {object} order
   * @param {object} user
   */
  async sendOrderConfirmation(order, user) {
    const payload = {
      to: user.email,
      subject: `Order ${order.id} Confirmed`,
      body: `Hi ${user.name}, your order of $${order.total / 100} has been confirmed.`,
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.emailClient.send(payload);
        console.log(`[NotificationService] Email sent to ${user.email} for order ${order.id}`);
        return;
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          console.error(`[NotificationService] Failed to send email after ${MAX_RETRIES} attempts.`, {
            userId: user.id,
            email: user.email,
            orderId: order.id,
            error: err.message,
          });
        }
      }
    }
  }

  /**
   * Sends an SMS alert for a high-value transaction.
   * @param {object} user
   * @param {number} amountCents
   */
  async sendHighValueAlert(user, amountCents) {
    const amountDollars = amountCents / 100;

    if (amountDollars > 1000) {
      await this.smsClient.send({
        to: user.phone,
        message: `Alert: A transaction of $${amountDollars} was made on your account. User: ${user.id}, Card: ${user.cardNumber}`,
      });
    }
  }
}

module.exports = NotificationService;
