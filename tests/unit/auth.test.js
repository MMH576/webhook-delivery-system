const crypto = require('crypto');

describe('Auth Utils', () => {
    let auth;
    let mockDb;
    let mockLogger;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        mockDb = {
            query: jest.fn()
        };
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        jest.doMock('../../src/config/database', () => mockDb);
        jest.doMock('../../src/utils/logger', () => mockLogger);

        auth = require('../../src/middleware/auth');
    });

    afterAll(() => {
        jest.resetModules();
    });

    describe('hashApiKey', () => {
        it('should return a 64 character hex string', () => {
            const hash = auth.hashApiKey('test-key');
            expect(hash).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should produce consistent hashes', () => {
            const key = 'my-api-key';
            const hash1 = auth.hashApiKey(key);
            const hash2 = auth.hashApiKey(key);
            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for different keys', () => {
            const hash1 = auth.hashApiKey('key1');
            const hash2 = auth.hashApiKey('key2');
            expect(hash1).not.toBe(hash2);
        });

        it('should use SHA-256 algorithm', () => {
            const key = 'test-key';
            const expected = crypto.createHash('sha256').update(key).digest('hex');
            expect(auth.hashApiKey(key)).toBe(expected);
        });
    });

    describe('generateApiKey', () => {
        it('should start with wh_ prefix', () => {
            const key = auth.generateApiKey();
            expect(key.startsWith('wh_')).toBe(true);
        });

        it('should be 51 characters long (3 + 48 hex chars)', () => {
            const key = auth.generateApiKey();
            expect(key.length).toBe(51);
        });

        it('should generate unique keys', () => {
            const keys = new Set();
            for (let i = 0; i < 100; i++) {
                keys.add(auth.generateApiKey());
            }
            expect(keys.size).toBe(100);
        });

        it('should contain only valid hex characters after prefix', () => {
            const key = auth.generateApiKey();
            const hexPart = key.slice(3);
            expect(hexPart).toMatch(/^[a-f0-9]{48}$/);
        });
    });

    describe('authMiddleware', () => {
        let mockReq, mockRes, mockNext;

        beforeEach(() => {
            mockReq = { headers: {} };
            mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            mockNext = jest.fn();
        });

        it('should return 401 if X-API-Key header is missing', async () => {
            await auth.authMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing X-API-Key header' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 if API key is invalid', async () => {
            mockReq.headers['x-api-key'] = 'invalid-key';
            mockDb.query.mockResolvedValue({ rows: [] });

            await auth.authMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 403 if API key is inactive', async () => {
            mockReq.headers['x-api-key'] = 'valid-but-inactive';
            mockDb.query.mockResolvedValue({
                rows: [{ id: 'key-id', name: 'Test Key', is_active: false }]
            });

            await auth.authMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'API key is disabled' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next() and set req.apiKeyId for valid active key', async () => {
            mockReq.headers['x-api-key'] = 'valid-key';
            mockDb.query
                .mockResolvedValueOnce({
                    rows: [{ id: 'key-123', name: 'My Key', is_active: true }]
                })
                .mockResolvedValueOnce({ rows: [] });

            await auth.authMiddleware(mockReq, mockRes, mockNext);

            expect(mockReq.apiKeyId).toBe('key-123');
            expect(mockReq.apiKeyName).toBe('My Key');
            expect(mockNext).toHaveBeenCalled();
        });

        it('should update last_used_at on successful auth', async () => {
            mockReq.headers['x-api-key'] = 'valid-key';
            mockDb.query
                .mockResolvedValueOnce({
                    rows: [{ id: 'key-123', name: 'My Key', is_active: true }]
                })
                .mockResolvedValueOnce({ rows: [] });

            await auth.authMiddleware(mockReq, mockRes, mockNext);

            expect(mockDb.query).toHaveBeenCalledTimes(2);
            expect(mockDb.query.mock.calls[1][0]).toContain('UPDATE api_keys SET last_used_at');
        });

        it('should return 500 on database error', async () => {
            mockReq.headers['x-api-key'] = 'some-key';
            mockDb.query.mockRejectedValue(new Error('DB connection failed'));

            await auth.authMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
        });
    });

    describe('createApiKey', () => {
        it('should create and return a new API key', async () => {
            mockDb.query.mockResolvedValue({
                rows: [{
                    id: 'key-uuid',
                    name: 'Test Key',
                    created_at: new Date().toISOString()
                }]
            });

            const result = await auth.createApiKey('Test Key');

            expect(result.id).toBe('key-uuid');
            expect(result.name).toBe('Test Key');
            expect(result.key).toMatch(/^wh_[a-f0-9]{48}$/);
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO api_keys'),
                expect.arrayContaining(['Test Key'])
            );
        });
    });

    describe('listApiKeys', () => {
        it('should return all API keys', async () => {
            mockDb.query.mockResolvedValue({
                rows: [
                    { id: 'key-1', name: 'Key 1', is_active: true },
                    { id: 'key-2', name: 'Key 2', is_active: false }
                ]
            });

            const result = await auth.listApiKeys();

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('Key 1');
        });
    });

    describe('revokeApiKey', () => {
        it('should set is_active to false', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            await auth.revokeApiKey('key-id');

            expect(mockDb.query).toHaveBeenCalledWith(
                'UPDATE api_keys SET is_active = false WHERE id = $1',
                ['key-id']
            );
        });
    });
});
