const authService = require('../src/auth/auth.service');

describe('AuthService Tests', () => {
    beforeEach(() => {
        authService.logout();
    });

    test('should log in with correct credentials', () => {
        const result = authService.login('admin', 'password123');
        expect(result).toBe(true);
        expect(authService.isUserLoggedIn()).toBe(true);
    });

    test('should NOT log in with incorrect credentials', () => {
        const result = authService.login('admin', 'wrong_password');
        expect(result).toBe(false);
        expect(authService.isUserLoggedIn()).toBe(false);
    });

    test('should log out correctly', () => {
        authService.login('admin', 'password123');
        authService.logout();
        expect(authService.isUserLoggedIn()).toBe(false);
    });
});
