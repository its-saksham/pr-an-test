const checkout = require('../src/payment/checkout');

// Updated for scoring test

describe('Checkout Module Tests', () => {
    beforeEach(() => {
        checkout.clearCart();
    });

    test('should add items to cart and update total', () => {
        checkout.addItem('Widget', 10);
        checkout.addItem('Gadget', 20);
        expect(checkout.cartItems.length).toBe(2);
        expect(checkout.total).toBe(30);
    });

    test('should process checkout successfully', () => {
        checkout.addItem('Widget', 10);
        const result = checkout.processCheckout();
        expect(result.status).toBe('SUCCESS');
        expect(result.totalPaid).toBe(10);
        expect(result.transactionId).toBeDefined();
    });

    test('should throw error on empty cart checkout', () => {
        expect(() => {
            checkout.processCheckout();
        }).toThrow('Cart is empty.');
    });
});
