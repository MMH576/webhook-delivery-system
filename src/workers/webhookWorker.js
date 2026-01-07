require('dotenv').config();
const axios = require('axios');
const db = require('../config/database');
const logger = require('../utils/logger');
const { webhookQueue } = require('../services/webhookService');

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

async function moveToDLQ(webhookId, reason, finalError) {
    await db.query(`UPDATE webhooks SET status = 'failed', updated_at = NOW() WHERE id = $1`, [webhookId]);
    await db.query(
        `INSERT INTO dead_letter_queue (webhook_id, reason, final_error)
         VALUES ($1, $2, $3)`,
        [webhookId, reason, finalError]
    );
    logger.info({ webhookId, reason }, 'Webhook moved to DLQ');
}

webhookQueue.process(async (job) => {
    const { webhookId } = job.data;
    logger.info({ webhookId, attempt: job.attemptsMade + 1 }, 'Processing webhook');

    const result = await db.query('SELECT * FROM webhooks WHERE id = $1', [webhookId]);
    if (result.rows.length === 0) {
        throw new Error(`Webhook ${webhookId} not found`);
    }

    const webhook = result.rows[0];
    const startTime = Date.now();

    try {
        const response = await axios.post(webhook.target_url, webhook.payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': webhook.signature,
                ...webhook.headers
            },
            timeout: 30000
        });

        const duration = Date.now() - startTime;

        await db.query(
            `INSERT INTO delivery_attempts (webhook_id, attempt_number, response_status, response_body, duration_ms)
             VALUES ($1, $2, $3, $4, $5)`,
            [webhookId, job.attemptsMade + 1, response.status, JSON.stringify(response.data).slice(0, 1000), duration]
        );

        await db.query(
            `UPDATE webhooks SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
            [webhookId]
        );

        logger.info({ webhookId, status: response.status, duration }, 'Webhook delivered');
        return { success: true, statusCode: response.status };

    } catch (error) {
        const duration = Date.now() - startTime;
        const statusCode = error.response?.status || null;
        const errorBody = error.response?.data ? JSON.stringify(error.response.data).slice(0, 1000) : null;

        await db.query(
            `INSERT INTO delivery_attempts (webhook_id, attempt_number, response_status, response_body, error_message, duration_ms)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [webhookId, job.attemptsMade + 1, statusCode, errorBody, error.message, duration]
        );

        if (!isRetryableError(error)) {
            logger.warn({ webhookId, statusCode }, 'Non-retryable error, moving to DLQ');
            await moveToDLQ(webhookId, `Non-retryable HTTP ${statusCode} error`, error.message);
            return { success: false, statusCode, nonRetryable: true };
        }

        logger.warn({ webhookId, error: error.message }, 'Webhook delivery failed, will retry');
        throw error;
    }
});

webhookQueue.on('failed', async (job, err) => {
    const { webhookId } = job.data;

    if (job.attemptsMade >= job.opts.attempts) {
        logger.error({ webhookId, attempts: job.attemptsMade }, 'Exhausted all retries');
        await moveToDLQ(webhookId, 'Exhausted all retry attempts', err.message);
    }
});

webhookQueue.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Job completed');
});

logger.info('Webhook worker started');

// Only add shutdown handlers if running standalone (not imported by server.js)
if (require.main === module) {
    let isShuttingDown = false;

    async function gracefulShutdown(signal) {
        if (isShuttingDown) return;
        isShuttingDown = true;

        logger.info({ signal }, 'Worker shutdown initiated');

        await webhookQueue.close();
        logger.info('Queue closed');

        await db.pool.end();
        logger.info('Database pool closed');

        logger.info('Worker shutdown complete');
        process.exit(0);
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
