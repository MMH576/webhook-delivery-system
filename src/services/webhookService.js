const Queue = require('bull');
require('dotenv').config();

const webhookQueue = new Queue('webhook-delivery', process.env.REDIS_URL || 'redis://localhost:6379', {
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 1000
        },
        removeOnComplete: 100,
        removeOnFail: 1000
    }
});

webhookQueue.on('error', (err) => console.error('Queue error:', err));

async function queueWebhook(webhookId) {
    const job = await webhookQueue.add({ webhookId }, { jobId: `webhook-${webhookId}` });
    console.log(`Queued webhook ${webhookId} as job ${job.id}`);
    return job;
}

async function getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
        webhookQueue.getWaitingCount(),
        webhookQueue.getActiveCount(),
        webhookQueue.getCompletedCount(),
        webhookQueue.getFailedCount()
    ]);
    return { waiting, active, completed, failed };
}

module.exports = { webhookQueue, queueWebhook, getQueueStats };
