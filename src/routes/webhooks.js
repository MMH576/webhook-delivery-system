const express = require('express');
const router = express.Router();
const db = require('../config/database');
const signature = require('../utils/signature');
const { queueWebhook } = require('../services/webhookService');

router.post('/', async (req, res) => {
    try {
        const { target_url, payload, headers } = req.body;

        if (!target_url || !payload) {
            return res.status(400).json({ error: 'target_url and payload are required' });
        }

        const sig = signature.generate(payload);

        const result = await db.query(
            `INSERT INTO webhooks (target_url, payload, headers, signature, status)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, status, created_at`,
            [target_url, payload, headers || {}, sig, 'pending']
        );

        await queueWebhook(result.rows[0].id);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating webhook:', error);
        res.status(500).json({ error: 'Failed to create webhook' });
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
        console.error('Error fetching webhook:', error);
        res.status(500).json({ error: 'Failed to fetch webhook' });
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
        console.error('Error listing webhooks:', error);
        res.status(500).json({ error: 'Failed to list webhooks' });
    }
});

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
        console.error('Error fetching stats:', error);
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
        console.error('Error fetching hourly stats:', error);
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
        console.error('Error listing DLQ:', error);
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

        res.json({ message: 'Webhook re-queued for retry', webhook_id: webhookId });
    } catch (error) {
        console.error('Error retrying from DLQ:', error);
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
        console.error('Error fetching attempts:', error);
        res.status(500).json({ error: 'Failed to fetch attempts' });
    }
});

module.exports = router;
