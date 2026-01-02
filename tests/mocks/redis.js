const mockRedis = {
    ping: jest.fn().mockResolvedValue('PONG'),
    call: jest.fn().mockResolvedValue(null),
    quit: jest.fn().mockResolvedValue(undefined)
};

module.exports = mockRedis;
