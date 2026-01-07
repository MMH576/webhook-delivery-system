const express = require('express');
const router = express.Router();
const db = require('../config/database');
const signature = require('../utils/signature');
const logger = require('../utils/logger');
const { queueWebhook } = require('../services/webhookService');
const { authMiddleware } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const { webhookValidation, handleValidationErrors, payloadSizeLimit } = require('../middleware/validate');

router.post('/',
    authMiddleware,
    apiLimiter,
    payloadSizeLimit(1024 * 1024),
    webhookValidation,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { target_url, payload, headers } = req.body;
            const sig = signature.generate(payload);

            const result = await db.query(
                `INSERT INTO webhooks (target_url, payload, headers, signature, status, api_key_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, status, created_at`,
                [target_url, payload, headers || {}, sig, 'pending', req.apiKeyId]
            );

            await queueWebhook(result.rows[0].id);

            logger.info({ webhookId: result.rows[0].id, apiKeyId: req.apiKeyId }, 'Webhook created');
            res.status(201).json(result.rows[0]);
        } catch (error) {
            logger.error({ err: error }, 'Error creating webhook');
            res.status(500).json({ error: 'Failed to create webhook' });
        }
    }
);

router.get('/stats/overview', async (req, res) => {
    try {
        const [statusCounts, dlqCount, attemptStats] = await Promise.all([
            db.query(`SELECT status, COUNT(*)::int as count FROM webhooks GROUP BY status`),
            db.query(`SELECT COUNT(*)::int as count FROM dead_letter_queue`),
            db.query(`SELECT COUNT(*)::int as total, COALESCE(AVG(duration_ms)::int, 0) as avg_duration FROM delivery_attempts`)
        ]);

        const byStatus = {};
        let totalWebhooks = 0;
        statusCounts.rows.forEach(row => {
            byStatus[row.status] = row.count;
            totalWebhooks += row.count;
        });

        res.json({
            total_webhooks: totalWebhooks,
            by_status: byStatus,
            delivery_attempts: {
                total: attemptStats.rows[0].total,
                avg_response_time_ms: attemptStats.rows[0].avg_duration
            },
            dlq_count: dlqCount.rows[0].count
        });
    } catch (error) {
        logger.error({ err: error }, 'Error fetching stats');
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

router.get('/stats/hourly', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                date_trunc('hour', updated_at) as hour,
                status,
                COUNT(*)::int as count
            FROM webhooks
            WHERE updated_at > NOW() - INTERVAL '24 hours'
            GROUP BY date_trunc('hour', updated_at), status
            ORDER BY hour DESC
        `);

        const hourlyMap = {};
        result.rows.forEach(row => {
            const hourKey = row.hour.toISOString();
            if (!hourlyMap[hourKey]) {
                hourlyMap[hourKey] = { hour: hourKey, pending: 0, delivered: 0, failed: 0 };
            }
            hourlyMap[hourKey][row.status] = row.count;
        });

        res.json({
            hourly_stats: Object.values(hourlyMap)
        });
    } catch (error) {
        logger.error({ err: error }, 'Error fetching hourly stats');
        res.status(500).json({ error: 'Failed to fetch hourly stats' });
    }
});

router.get('/dlq/list', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        const result = await db.query(
            `SELECT dlq.*, w.target_url, w.payload, w.status as webhook_status
             FROM dead_letter_queue dlq
             JOIN webhooks w ON dlq.webhook_id = w.id
             ORDER BY dlq.moved_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countResult = await db.query('SELECT COUNT(*) FROM dead_letter_queue');

        res.json({
            dead_letters: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        logger.error({ err: error }, 'Error listing DLQ');
        res.status(500).json({ error: 'Failed to list dead letter queue' });
    }
});

router.post('/dlq/:id/retry', async (req, res) => {
    try {
        const { id } = req.params;

        const dlqResult = await db.query(
            'SELECT * FROM dead_letter_queue WHERE id = $1',
            [id]
        );

        if (dlqResult.rows.length === 0) {
            return res.status(404).json({ error: 'DLQ entry not found' });
        }

        const dlqEntry = dlqResult.rows[0];
        const webhookId = dlqEntry.webhook_id;

        await db.query(
            `UPDATE webhooks SET status = 'pending', updated_at = NOW() WHERE id = $1`,
            [webhookId]
        );

        await db.query('DELETE FROM dead_letter_queue WHERE id = $1', [id]);

        await queueWebhook(webhookId);

        logger.info({ dlqId: id, webhookId }, 'Webhook retried from DLQ');
        res.json({ message: 'Webhook re-queued for retry', webhook_id: webhookId });
    } catch (error) {
        logger.error({ err: error }, 'Error retrying from DLQ');
        res.status(500).json({ error: 'Failed to retry webhook' });
    }
});

router.get('/:id/attempts', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `SELECT * FROM delivery_attempts WHERE webhook_id = $1 ORDER BY attempt_number`,
            [id]
        );

        res.json({ attempts: result.rows });
    } catch (error) {
        logger.error({ err: error }, 'Error fetching attempts');
        res.status(500).json({ error: 'Failed to fetch attempts' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `SELECT w.*, COUNT(da.id) as attempts
             FROM webhooks w
             LEFT JOIN delivery_attempts da ON w.id = da.webhook_id
             WHERE w.id = $1
             GROUP BY w.id`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error({ err: error }, 'Error fetching webhook');
        res.status(500).json({ error: 'Failed to fetch webhook' });
    }
});

// Demo endpoint - creates sample webhooks to showcase the system
router.post('/demo/run', async (req, res) => {
    try {
        const demoWebhooks = [
            {
                target_url: 'https://webhook.site/demo-success',
                payload: { event: 'user.created', user_id: 'usr_' + Date.now(), email: 'demo@example.com' },
                status: 'delivered'
            },
            {
                target_url: 'https://webhook.site/demo-success-2',
                payload: { event: 'order.completed', order_id: 'ord_' + Date.now(), amount: 99.99 },
                status: 'delivered'
            },
            {
                target_url: 'https://webhook.site/demo-success-3',
                payload: { event: 'payment.received', payment_id: 'pay_' + Date.now(), currency: 'USD' },
                status: 'delivered'
            },
            {
                target_url: 'https://invalid-endpoint.example/webhook',
                payload: { event: 'test.failure', test_id: 'test_' + Date.now() },
                status: 'failed'
            },
            {
                target_url: 'https://timeout-server.example/slow',
                payload: { event: 'sync.timeout', sync_id: 'sync_' + Date.now() },
                status: 'failed'
            }
        ];

        const createdWebhooks = [];

        for (const webhook of demoWebhooks) {
            const sig = signature.generate(webhook.payload);
            const result = await db.query(
                `INSERT INTO webhooks (target_url, payload, headers, signature, status)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, status, created_at`,
                [webhook.target_url, webhook.payload, {}, sig, webhook.status]
            );

            const webhookId = result.rows[0].id;
            createdWebhooks.push(result.rows[0]);

            // Create realistic delivery attempts
            if (webhook.status === 'delivered') {
                await db.query(
                    `INSERT INTO delivery_attempts (webhook_id, attempt_number, response_status, response_body, duration_ms)
                     VALUES ($1, 1, 200, '{"received": true}', $2)`,
                    [webhookId, Math.floor(Math.random() * 300) + 50]
                );
            } else if (webhook.status === 'failed') {
                // Create multiple failed attempts to show retry behavior
                const delays = [100, 200, 400, 800, 1600];
                for (let i = 1; i <= 5; i++) {
                    await db.query(
                        `INSERT INTO delivery_attempts (webhook_id, attempt_number, response_status, error_message, duration_ms)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [webhookId, i, i <= 3 ? 503 : null, i <= 3 ? 'Service Unavailable' : 'Connection timeout', delays[i-1]]
                    );
                }
                // Move to DLQ
                await db.query(
                    `INSERT INTO dead_letter_queue (webhook_id, reason, final_error)
                     VALUES ($1, 'Exhausted all retry attempts', 'Connection timeout after 5 attempts')`,
                    [webhookId]
                );
            }
        }

        logger.info({ count: createdWebhooks.length }, 'Demo webhooks created');
        res.status(201).json({
            message: 'Demo data created successfully!',
            webhooks_created: createdWebhooks.length,
            delivered: demoWebhooks.filter(w => w.status === 'delivered').length,
            failed: demoWebhooks.filter(w => w.status === 'failed').length
        });
    } catch (error) {
        logger.error({ err: error }, 'Error creating demo data');
        res.status(500).json({ error: 'Failed to create demo data' });
    }
});

// Clear demo data
router.delete('/demo/clear', async (req, res) => {
    try {
        await db.query('DELETE FROM dead_letter_queue');
        await db.query('DELETE FROM delivery_attempts');
        await db.query('DELETE FROM webhooks');

        logger.info('Demo data cleared');
        res.json({ message: 'All demo data cleared successfully' });
    } catch (error) {
        logger.error({ err: error }, 'Error clearing demo data');
        res.status(500).json({ error: 'Failed to clear demo data' });
    }
});

router.get('/', async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        let query = 'SELECT * FROM webhooks';
        const params = [];

        if (status) {
            query += ' WHERE status = $1';
            params.push(status);
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await db.query(query, params);
        const countResult = await db.query('SELECT COUNT(*) FROM webhooks' + (status ? ' WHERE status = $1' : ''), status ? [status] : []);

        res.json({
            webhooks: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        logger.error({ err: error }, 'Error listing webhooks');
        res.status(500).json({ error: 'Failed to list webhooks' });
    }
});

module.exports = router;
