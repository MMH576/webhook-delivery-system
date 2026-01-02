const mockWebhookQueue = {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    process: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined)
};

const mockQueueWebhook = jest.fn().mockResolvedValue({ id: 'mock-job-id' });

module.exports = {
    webhookQueue: mockWebhookQueue,
    queueWebhook: mockQueueWebhook,
    __resetMocks: () => {
        mockWebhookQueue.add.mockReset().mockResolvedValue({ id: 'mock-job-id' });
        mockQueueWebhook.mockReset().mockResolvedValue({ id: 'mock-job-id' });
    }
};
