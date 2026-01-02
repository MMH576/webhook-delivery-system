const crypto = require('crypto');

describe('Signature Utils', () => {
    let signature;
    const originalEnv = process.env.WEBHOOK_SECRET;

    beforeAll(() => {
        process.env.WEBHOOK_SECRET = 'test-secret-key';
        jest.resetModules();
        signature = require('../../src/utils/signature');
    });

    afterAll(() => {
        process.env.WEBHOOK_SECRET = originalEnv;
    });

    describe('generate', () => {
        it('should generate a sha256 prefixed signature', () => {
            const payload = { event: 'test', data: { id: 1 } };
            const sig = signature.generate(payload);

            expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
        });

        it('should generate consistent signatures for same payload', () => {
            const payload = { event: 'user.created', data: { userId: '123' } };

            const sig1 = signature.generate(payload);
            const sig2 = signature.generate(payload);

            expect(sig1).toBe(sig2);
        });

        it('should generate different signatures for different payloads', () => {
            const payload1 = { event: 'test1' };
            const payload2 = { event: 'test2' };

            const sig1 = signature.generate(payload1);
            const sig2 = signature.generate(payload2);

            expect(sig1).not.toBe(sig2);
        });

        it('should handle complex nested payloads', () => {
            const payload = {
                event: 'order.completed',
                data: {
                    orderId: 'ord_123',
                    items: [
                        { sku: 'SKU001', qty: 2 },
                        { sku: 'SKU002', qty: 1 }
                    ],
                    metadata: {
                        source: 'api',
                        version: '2.0'
                    }
                }
            };

            const sig = signature.generate(payload);
            expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
        });

        it('should handle empty object payload', () => {
            const sig = signature.generate({});
            expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
        });
    });

    describe('verify', () => {
        it('should return true for valid signature', () => {
            const payload = { event: 'test', data: { id: 1 } };
            const sig = signature.generate(payload);

            expect(signature.verify(payload, sig)).toBe(true);
        });

        it('should return false for invalid signature', () => {
            const payload = { event: 'test', data: { id: 1 } };
            const invalidSig = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

            expect(signature.verify(payload, invalidSig)).toBe(false);
        });

        it('should return false for tampered payload', () => {
            const originalPayload = { event: 'test', data: { id: 1 } };
            const sig = signature.generate(originalPayload);

            const tamperedPayload = { event: 'test', data: { id: 2 } };
            expect(signature.verify(tamperedPayload, sig)).toBe(false);
        });

        it('should use timing-safe comparison', () => {
            const payload = { event: 'test' };
            const sig = signature.generate(payload);

            const spy = jest.spyOn(crypto, 'timingSafeEqual');
            signature.verify(payload, sig);

            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });
    });
});
