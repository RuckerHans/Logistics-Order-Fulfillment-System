import { readFileSync } from 'fs';
import path from 'path';
import { OrderStatusChangedEventSchema } from '../src/schemas/order-status-changed.schema';

const fixturesDir = path.join(__dirname, '../fixtures');

describe('order.status_changed contract', () => {
  it('accepts the canonical valid payload', () => {
    const payload = JSON.parse(readFileSync(path.join(fixturesDir, 'order-status-changed.valid.json'), 'utf-8'));
    expect(() => OrderStatusChangedEventSchema.parse(payload)).not.toThrow();
  });

  it('rejects the canonical invalid payload', () => {
    const payload = JSON.parse(readFileSync(path.join(fixturesDir, 'order-status-changed.invalid.json'), 'utf-8'));
    expect(() => OrderStatusChangedEventSchema.parse(payload)).toThrow();
  });
});
