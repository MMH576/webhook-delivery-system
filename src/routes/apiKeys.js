const express = require('express');
const router = express.Router();
const { createApiKey, listApiKeys, revokeApiKey } = require('../middleware/auth');
const { strictLimiter } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

router.post('/', strictLimiter, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'name is required' });
        }

        const apiKey = await createApiKey(name.trim());

        logger.info({ name: apiKey.name, id: apiKey.id }, 'API key created');

        res.status(201).json({
            message: 'API key created. Save this key - it will not be shown again.',
            id: apiKey.id,
            name: apiKey.name,
            key: apiKey.key,
            created_at: apiKey.created_at
        });
    } catch (error) {
        logger.error({ err: error }, 'Failed to create API key');
        res.status(500).json({ error: 'Failed to create API key' });
    }
});

router.get('/', strictLimiter, async (req, res) => {
    try {
        const keys = await listApiKeys();
        res.json({ api_keys: keys });
    } catch (error) {
        logger.error({ err: error }, 'Failed to list API keys');
        res.status(500).json({ error: 'Failed to list API keys' });
    }
});

router.delete('/:id', strictLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        await revokeApiKey(id);

        logger.info({ id }, 'API key revoked');
        res.json({ message: 'API key revoked' });
    } catch (error) {
        logger.error({ err: error }, 'Failed to revoke API key');
        res.status(500).json({ error: 'Failed to revoke API key' });
    }
});

module.exports = router;
