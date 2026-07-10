import { getNextRetryTarget, RESERVE_STOCK } from '../src/topology/rabbitmq';

describe('getNextRetryTarget', () => {
  it('routes to the first retry stage on the first failure (no x-death header)', () => {
    expect(getNextRetryTarget(undefined, RESERVE_STOCK)).toBe(RESERVE_STOCK.retryQueues[0]);
  });

  it('routes to the second stage after one retry-queue passage', () => {
    const headers = { 'x-death': [{ queue: RESERVE_STOCK.retryQueues[0] }] };
    expect(getNextRetryTarget(headers, RESERVE_STOCK)).toBe(RESERVE_STOCK.retryQueues[1]);
  });

  it('routes to the third stage after two retry-queue passages', () => {
    const headers = {
      'x-death': [{ queue: RESERVE_STOCK.retryQueues[0] }, { queue: RESERVE_STOCK.retryQueues[1] }],
    };
    expect(getNextRetryTarget(headers, RESERVE_STOCK)).toBe(RESERVE_STOCK.retryQueues[2]);
  });

  it('routes to the DLQ once all three stages are exhausted', () => {
    const headers = {
      'x-death': RESERVE_STOCK.retryQueues.map((queue) => ({ queue })),
    };
    expect(getNextRetryTarget(headers, RESERVE_STOCK)).toBe(RESERVE_STOCK.dlq);
  });

  it('ignores unrelated x-death entries (e.g. from a different queue entirely)', () => {
    const headers = { 'x-death': [{ queue: 'some.other.queue' }] };
    expect(getNextRetryTarget(headers, RESERVE_STOCK)).toBe(RESERVE_STOCK.retryQueues[0]);
  });
});
