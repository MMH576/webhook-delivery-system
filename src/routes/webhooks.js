const express = require('express');
const router = express.Router();
const db = require('../config/database');
const signature = require('../utils/signature');

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
