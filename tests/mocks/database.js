const mockQuery = jest.fn();
const mockPool = {
    end: jest.fn().mockResolvedValue(undefined)
};

module.exports = {
    query: mockQuery,
    pool: mockPool,
    __resetMocks: () => {
        mockQuery.mockReset();
        mockPool.end.mockReset();
    }
};
