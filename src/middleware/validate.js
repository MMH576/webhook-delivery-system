const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

const webhookValidation = [
    body('target_url')
        .notEmpty().withMessage('target_url is required')
        .isURL({ protocols: ['http', 'https'], require_protocol: true })
        .withMessage('target_url must be a valid HTTP/HTTPS URL'),

    body('payload')
        .notEmpty().withMessage('payload is required')
        .isObject().withMessage('payload must be an object'),

    body('headers')
        .optional()
        .isObject().withMessage('headers must be an object')
];

function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        logger.warn({ errors: errors.array(), path: req.path }, 'Validation failed');
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array().map(e => ({
                field: e.path,
                message: e.msg
            }))
        });
    }

    next();
}

function payloadSizeLimit(maxSizeBytes = 1024 * 1024) {
    return (req, res, next) => {
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);

        if (contentLength > maxSizeBytes) {
            logger.warn({ size: contentLength, max: maxSizeBytes }, 'Payload too large');
            return res.status(413).json({
                error: 'Payload too large',
                message: `Request body must be less than ${maxSizeBytes / 1024}KB`
            });
        }

        next();
    };
}

module.exports = {
    webhookValidation,
    handleValidationErrors,
    payloadSizeLimit
};
