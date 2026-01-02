describe('Validate Middleware', () => {
    let validate;
    let mockLogger;

    beforeAll(() => {
        jest.resetModules();
        mockLogger = require('../mocks/logger');
        jest.doMock('../../src/utils/logger', () => mockLogger);
        validate = require('../../src/middleware/validate');
    });

    afterAll(() => {
        jest.resetModules();
    });

    describe('payloadSizeLimit', () => {
        let middleware;
        let mockReq, mockRes, mockNext;

        beforeEach(() => {
            mockReq = { headers: {} };
            mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            mockNext = jest.fn();
        });

        it('should call next() when content-length is under limit', () => {
            middleware = validate.payloadSizeLimit(1024);
            mockReq.headers['content-length'] = '500';

            middleware(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should call next() when content-length is missing', () => {
            middleware = validate.payloadSizeLimit(1024);

            middleware(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should return 413 when content-length exceeds limit', () => {
            middleware = validate.payloadSizeLimit(1024);
            mockReq.headers['content-length'] = '2000';

            middleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(413);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Payload too large',
                message: 'Request body must be less than 1KB'
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 413 when content-length equals limit + 1', () => {
            middleware = validate.payloadSizeLimit(1024);
            mockReq.headers['content-length'] = '1025';

            middleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(413);
        });

        it('should allow content-length exactly at limit', () => {
            middleware = validate.payloadSizeLimit(1024);
            mockReq.headers['content-length'] = '1024';

            middleware(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should use 1MB default limit', () => {
            middleware = validate.payloadSizeLimit();
            mockReq.headers['content-length'] = String(1024 * 1024);

            middleware(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should reject payloads over 1MB default', () => {
            middleware = validate.payloadSizeLimit();
            mockReq.headers['content-length'] = String(1024 * 1024 + 1);

            middleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(413);
        });
    });

    describe('webhookValidation', () => {
        it('should export an array of validators', () => {
            expect(Array.isArray(validate.webhookValidation)).toBe(true);
            expect(validate.webhookValidation.length).toBe(3);
        });
    });

    describe('handleValidationErrors', () => {
        it('should be a function', () => {
            expect(typeof validate.handleValidationErrors).toBe('function');
        });
    });
});
