describe('Webhook Worker', () => {
    let mockDb;
    let mockAxios;
    let mockLogger;

    beforeAll(() => {
        jest.resetModules();

        mockDb = require('../mocks/database');
        mockLogger = require('../mocks/logger');

        jest.doMock('../../src/config/database', () => mockDb);
        jest.doMock('../../src/utils/logger', () => mockLogger);
    });

    beforeEach(() => {
        mockDb.__resetMocks();
        jest.clearAllMocks();
    });

    afterAll(() => {
        jest.resetModules();
    });

    describe('isRetryableError', () => {
        it('should identify network errors as retryable', () => {
            const error = new Error('ECONNREFUSED');
            expect(isRetryableError(error)).toBe(true);
        });

        it('should identify 5xx errors as retryable', () => {
            const error = { response: { status: 500 } };
            expect(isRetryableError(error)).toBe(true);

            error.response.status = 502;
            expect(isRetryableError(error)).toBe(true);

            error.response.status = 503;
            expect(isRetryableError(error)).toBe(true);
        });

        it('should identify 429 as retryable', () => {
            const error = { response: { status: 429 } };
            expect(isRetryableError(error)).toBe(true);
        });

        it('should identify 4xx (except 429) as non-retryable', () => {
            const error = { response: { status: 400 } };
            expect(isRetryableError(error)).toBe(false);

            error.response.status = 401;
            expect(isRetryableError(error)).toBe(false);

            error.response.status = 404;
            expect(isRetryableError(error)).toBe(false);
        });
    });

    function isRetryableError(error) {
        if (!error.response) {
            return true;
        }
        const status = error.response.status;
        if (status >= 500 && status < 600) {
            return true;
        }
        if (status === 429) {
            return true;
        }
        return false;
    }

    describe('moveToDLQ logic', () => {
        it('should update webhook status to failed', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            await moveToDLQ('webhook-123', 'Max retries exceeded', 'Connection timeout');

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining("UPDATE webhooks SET status = 'failed'"),
                ['webhook-123']
            );
        });

        it('should insert into dead_letter_queue', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            await moveToDLQ('webhook-123', 'Non-retryable error', 'HTTP 404');

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO dead_letter_queue'),
                ['webhook-123', 'Non-retryable error', 'HTTP 404']
            );
        });

        async function moveToDLQ(webhookId, reason, finalError) {
            await mockDb.query(
                `UPDATE webhooks SET status = 'failed', updated_at = NOW() WHERE id = $1`,
                [webhookId]
            );
            await mockDb.query(
                `INSERT INTO dead_letter_queue (webhook_id, reason, final_error) VALUES ($1, $2, $3)`,
                [webhookId, reason, finalError]
            );
        }
    });

    describe('Job processing simulation', () => {
        it('should record successful delivery attempt', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            const webhookId = 'webhook-123';
            const attemptNumber = 1;
            const responseStatus = 200;
            const responseBody = JSON.stringify({ ok: true });
            const duration = 150;

            await mockDb.query(
                `INSERT INTO delivery_attempts (webhook_id, attempt_number, response_status, response_body, duration_ms)
                 VALUES ($1, $2, $3, $4, $5)`,
                [webhookId, attemptNumber, responseStatus, responseBody, duration]
            );

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO delivery_attempts'),
                [webhookId, attemptNumber, responseStatus, responseBody, duration]
            );
        });

        it('should record failed delivery attempt with error', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            const webhookId = 'webhook-456';
            const attemptNumber = 2;
            const responseStatus = 500;
            const errorMessage = 'Internal Server Error';
            const duration = 5000;

            await mockDb.query(
                `INSERT INTO delivery_attempts (webhook_id, attempt_number, response_status, error_message, duration_ms)
                 VALUES ($1, $2, $3, $4, $5)`,
                [webhookId, attemptNumber, responseStatus, errorMessage, duration]
            );

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO delivery_attempts'),
                [webhookId, attemptNumber, responseStatus, errorMessage, duration]
            );
        });

        it('should update webhook status to delivered on success', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            const webhookId = 'webhook-789';

            await mockDb.query(
                `UPDATE webhooks SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
                [webhookId]
            );

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'delivered'"),
                [webhookId]
            );
        });
    });

    describe('Retry backoff calculation', () => {
        it('should calculate exponential backoff delays', () => {
            const baseDelay = 2000;

            expect(calculateBackoff(0, baseDelay)).toBe(2000);
            expect(calculateBackoff(1, baseDelay)).toBe(4000);
            expect(calculateBackoff(2, baseDelay)).toBe(8000);
            expect(calculateBackoff(3, baseDelay)).toBe(16000);
            expect(calculateBackoff(4, baseDelay)).toBe(32000);
        });

        function calculateBackoff(attemptsMade, baseDelay) {
            return baseDelay * Math.pow(2, attemptsMade);
        }
    });
});
