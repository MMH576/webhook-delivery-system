process.env.NODE_ENV = 'test';
process.env.WEBHOOK_SECRET = 'test-secret-key';
process.env.DATABASE_URL = 'postgresql://webhook_user:webhook_pass@localhost:5432/webhook_db_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.LOG_LEVEL = 'silent';

jest.setTimeout(10000);

afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
});
