const crypto = require('crypto');

const SECRET = process.env.WEBHOOK_SECRET || 'default-secret';

function generate(payload) {
    const hmac = crypto.createHmac('sha256', SECRET);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
}

function verify(payload, signature) {
    const expected = generate(payload);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

module.exports = { generate, verify };
