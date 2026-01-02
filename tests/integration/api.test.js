const request = require('supertest');

describe('API Integration Tests', () => {
    let app;
    let mockDb;
    let mockRedis;
    let mockWebhookService;
    let mockLogger;

    beforeAll(() => {
        jest.resetModules();

        mockDb = {
            query: jest.fn(),
            pool: { end: jest.fn().mockResolvedValue(undefined) }
        };

        mockRedis = {
            ping: jest.fn().mockResolvedValue('PONG'),
            call: jest.fn().mockResolvedValue(null),
            quit: jest.fn().mockResolvedValue(undefined)
        };

        mockWebhookService = {
            webhookQueue: {
                add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
                process: jest.fn(),
                on: jest.fn(),
                close: jest.fn().mockResolvedValue(undefined),
                getJobCounts: jest.fn().mockResolvedValue({
                    waiting: 0, active: 0, completed: 10, failed: 1
                })
            },
            queueWebhook: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
            getQueueStats: jest.fn().mockResolvedValue({
                waiting: 0, active: 0, completed: 10, failed: 1
            })
        };

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            child: jest.fn().mockReturnThis()
        };

        jest.doMock('../../src/config/database', () => mockDb);
        jest.doMock('../../src/config/redis', () => mockRedis);
        jest.doMock('../../src/services/webhookService', () => mockWebhookService);
        jest.doMock('../../src/utils/logger', () => mockLogger);

        jest.doMock('express-rate-limit', () => {
            return () => (req, res, next) => next();
        });

        jest.doMock('rate-limit-redis', () => ({
            default: class MockRedisStore {
                constructor() {}
                init() {}
            }
        }));

        app = require('../../src/app');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockDb.query.mockReset();
        mockWebhookService.queueWebhook.mockReset().mockResolvedValue({ id: 'mock-job-id' });
    });

    afterAll(() => {
        jest.resetModules();
    });

    describe('Health Endpoints', () => {
        describe('GET /health/live', () => {
            it('should return 200 with ok status', async () => {
                const res = await request(app).get('/health/live');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ status: 'ok' });
            });
        });

        describe('GET /health/ready', () => {
            it('should return 200 when all services are healthy', async () => {
                mockDb.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
                mockRedis.ping.mockResolvedValue('PONG');

                const res = await request(app).get('/health/ready');

                expect(res.status).toBe(200);
                expect(res.body.status).toBe('ok');
                expect(res.body.database).toBe('connected');
                expect(res.body.redis).toBe('connected');
            });

            it('should return 503 when database is down', async () => {
                mockDb.query.mockRejectedValue(new Error('Connection refused'));
                mockRedis.ping.mockResolvedValue('PONG');

                const res = await request(app).get('/health/ready');

                expect(res.status).toBe(503);
                expect(res.body.status).toBe('error');
                expect(res.body.database).toBe('disconnected');
            });

            it('should return 503 when redis is down', async () => {
                mockDb.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
                mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

                const res = await request(app).get('/health/ready');

                expect(res.status).toBe(503);
                expect(res.body.status).toBe('error');
                expect(res.body.redis).toBe('disconnected');
            });
        });
    });

    describe('API Keys Endpoints', () => {
        describe('POST /api/keys', () => {
            it('should create an API key with valid name', async () => {
                mockDb.query.mockResolvedValue({
                    rows: [{
                        id: 'key-uuid',
                        name: 'Test Key',
                        created_at: new Date().toISOString()
                    }]
                });

                const res = await request(app)
                    .post('/api/keys')
                    .send({ name: 'Test Key' });

                expect(res.status).toBe(201);
                expect(res.body.id).toBe('key-uuid');
                expect(res.body.name).toBe('Test Key');
                expect(res.body.key).toMatch(/^wh_[a-f0-9]{48}$/);
            });

            it('should return 400 if name is missing', async () => {
                const res = await request(app)
                    .post('/api/keys')
                    .send({});

                expect(res.status).toBe(400);
                expect(res.body.error).toBe('name is required');
            });

            it('should return 400 if name is empty string', async () => {
                const res = await request(app)
                    .post('/api/keys')
                    .send({ name: '   ' });

                expect(res.status).toBe(400);
                expect(res.body.error).toBe('name is required');
            });
        });

        describe('GET /api/keys', () => {
            it('should list all API keys', async () => {
                mockDb.query.mockResolvedValue({
                    rows: [
                        { id: 'key-1', name: 'Key 1', is_active: true, created_at: new Date() },
                        { id: 'key-2', name: 'Key 2', is_active: false, created_at: new Date() }
                    ]
                });

                const res = await request(app).get('/api/keys');

                expect(res.status).toBe(200);
                expect(res.body.api_keys).toHaveLength(2);
            });
        });

        describe('DELETE /api/keys/:id', () => {
            it('should revoke an API key', async () => {
                mockDb.query.mockResolvedValue({ rows: [] });

                const res = await request(app).delete('/api/keys/key-uuid');

                expect(res.status).toBe(200);
                expect(res.body.message).toBe('API key revoked');
            });
        });
    });

    describe('Webhooks Endpoints', () => {
        const validApiKey = 'wh_' + 'a'.repeat(48);

        describe('POST /api/webhooks', () => {
            it('should return 401 without API key', async () => {
                const res = await request(app)
                    .post('/api/webhooks')
                    .send({
                        target_url: 'https://example.com/webhook',
                        payload: { event: 'test' }
                    });

                expect(res.status).toBe(401);
                expect(res.body.error).toBe('Missing X-API-Key header');
            });

            it('should return 401 with invalid API key', async () => {
                mockDb.query.mockResolvedValue({ rows: [] });

                const res = await request(app)
                    .post('/api/webhooks')
                    .set('X-API-Key', 'invalid-key')
                    .send({
                        target_url: 'https://example.com/webhook',
                        payload: { event: 'test' }
                    });

                expect(res.status).toBe(401);
                expect(res.body.error).toBe('Invalid API key');
            });

            it('should create webhook with valid request', async () => {
                mockDb.query
                    .mockResolvedValueOnce({
                        rows: [{ id: 'api-key-id', name: 'Test', is_active: true }]
                    })
                    .mockResolvedValueOnce({ rows: [] })
                    .mockResolvedValueOnce({
                        rows: [{
                            id: 'webhook-uuid',
                            status: 'pending',
                            created_at: new Date().toISOString()
                        }]
                    });

                const res = await request(app)
                    .post('/api/webhooks')
                    .set('X-API-Key', validApiKey)
                    .send({
                        target_url: 'https://example.com/webhook',
                        payload: { event: 'user.created', userId: '123' }
                    });

                expect(res.status).toBe(201);
                expect(res.body.id).toBe('webhook-uuid');
                expect(res.body.status).toBe('pending');
            });

            it('should return 400 for invalid target_url', async () => {
                mockDb.query
                    .mockResolvedValueOnce({
                        rows: [{ id: 'api-key-id', name: 'Test', is_active: true }]
                    })
                    .mockResolvedValueOnce({ rows: [] });

                const res = await request(app)
                    .post('/api/webhooks')
                    .set('X-API-Key', validApiKey)
                    .send({
                        target_url: 'not-a-url',
                        payload: { event: 'test' }
                    });

                expect(res.status).toBe(400);
                expect(res.body.error).toBe('Validation failed');
            });

            it('should return 400 if payload is missing', async () => {
                mockDb.query
                    .mockResolvedValueOnce({
                        rows: [{ id: 'api-key-id', name: 'Test', is_active: true }]
                    })
                    .mockResolvedValueOnce({ rows: [] });

                const res = await request(app)
                    .post('/api/webhooks')
                    .set('X-API-Key', validApiKey)
                    .send({
                        target_url: 'https://example.com/webhook'
                    });

                expect(res.status).toBe(400);
                expect(res.body.error).toBe('Validation failed');
            });
        });

        describe('GET /api/webhooks/:id', () => {
            it('should return webhook details', async () => {
                mockDb.query.mockResolvedValue({
                    rows: [{
                        id: 'webhook-uuid',
                        target_url: 'https://example.com',
                        status: 'delivered',
                        attempts: 1,
                        created_at: new Date()
                    }]
                });

                const res = await request(app).get('/api/webhooks/webhook-uuid');

                expect(res.status).toBe(200);
                expect(res.body.id).toBe('webhook-uuid');
                expect(res.body.status).toBe('delivered');
            });

            it('should return 404 for non-existent webhook', async () => {
                mockDb.query.mockResolvedValue({ rows: [] });

                const res = await request(app).get('/api/webhooks/non-existent');

                expect(res.status).toBe(404);
                expect(res.body.error).toBe('Webhook not found');
            });
        });

        describe('GET /api/webhooks', () => {
            it('should return paginated list of webhooks', async () => {
                mockDb.query
                    .mockResolvedValueOnce({
                        rows: [
                            { id: 'wh-1', status: 'pending' },
                            { id: 'wh-2', status: 'delivered' }
                        ]
                    })
                    .mockResolvedValueOnce({ rows: [{ count: '10' }] });

                const res = await request(app).get('/api/webhooks?limit=10&offset=0');

                expect(res.status).toBe(200);
                expect(res.body.webhooks).toHaveLength(2);
                expect(res.body.total).toBe(10);
            });

            it('should filter by status', async () => {
                mockDb.query
                    .mockResolvedValueOnce({
                        rows: [{ id: 'wh-1', status: 'failed' }]
                    })
                    .mockResolvedValueOnce({ rows: [{ count: '5' }] });

                const res = await request(app).get('/api/webhooks?status=failed');

                expect(res.status).toBe(200);
                expect(mockDb.query.mock.calls[0][0]).toContain('WHERE status = $1');
            });
        });

        describe('GET /api/webhooks/:id/attempts', () => {
            it('should return delivery attempts', async () => {
                mockDb.query.mockResolvedValue({
                    rows: [
                        { attempt_number: 1, response_status: 500, error_message: 'Server error' },
                        { attempt_number: 2, response_status: 200 }
                    ]
                });

                const res = await request(app).get('/api/webhooks/webhook-uuid/attempts');

                expect(res.status).toBe(200);
                expect(res.body.attempts).toHaveLength(2);
            });
        });

        describe('GET /api/webhooks/stats/overview', () => {
            it('should return statistics', async () => {
                mockDb.query
                    .mockResolvedValueOnce({
                        rows: [
                            { status: 'pending', count: 5 },
                            { status: 'delivered', count: 100 },
                            { status: 'failed', count: 3 }
                        ]
                    })
                    .mockResolvedValueOnce({ rows: [{ count: 2 }] })
                    .mockResolvedValueOnce({ rows: [{ total: 150, avg_duration: 250 }] });

                const res = await request(app).get('/api/webhooks/stats/overview');

                expect(res.status).toBe(200);
                expect(res.body.total_webhooks).toBe(108);
                expect(res.body.by_status.delivered).toBe(100);
                expect(res.body.dlq_count).toBe(2);
            });
        });
    });

    describe('DLQ Endpoints', () => {
        describe('GET /api/webhooks/dlq/list', () => {
            it('should return dead letter queue entries', async () => {
                mockDb.query
                    .mockResolvedValueOnce({
                        rows: [
                            { id: 'dlq-1', webhook_id: 'wh-1', reason: 'Max retries' }
                        ]
                    })
                    .mockResolvedValueOnce({ rows: [{ count: '5' }] });

                const res = await request(app).get('/api/webhooks/dlq/list');

                expect(res.status).toBe(200);
                expect(res.body.dead_letters).toHaveLength(1);
                expect(res.body.total).toBe(5);
            });
        });

        describe('POST /api/webhooks/dlq/:id/retry', () => {
            it('should retry a DLQ entry', async () => {
                mockDb.query
                    .mockResolvedValueOnce({ rows: [{ id: 'dlq-1', webhook_id: 'wh-1' }] })
                    .mockResolvedValueOnce({ rows: [] })
                    .mockResolvedValueOnce({ rows: [] });

                const res = await request(app).post('/api/webhooks/dlq/dlq-1/retry');

                expect(res.status).toBe(200);
                expect(res.body.message).toBe('Webhook re-queued for retry');
                expect(mockWebhookService.queueWebhook).toHaveBeenCalledWith('wh-1');
            });

            it('should return 404 for non-existent DLQ entry', async () => {
                mockDb.query.mockResolvedValue({ rows: [] });

                const res = await request(app).post('/api/webhooks/dlq/non-existent/retry');

                expect(res.status).toBe(404);
                expect(res.body.error).toBe('DLQ entry not found');
            });
        });
    });
});
