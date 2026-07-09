import { OrderStatus } from '@logistics/contracts';
import { OrderStateMachine, TRANSITIONS } from './order-state-machine';

describe('OrderStateMachine', () => {
  const machine = new OrderStateMachine();
  const allStatuses = Object.values(OrderStatus);

  describe('valid transitions', () => {
    it.each(
      Object.entries(TRANSITIONS).flatMap(([from, tos]) =>
        tos.map((to) => [from as OrderStatus, to]),
      ),
    )('allows %s -> %s', (from, to) => {
      expect(machine.canTransition(from, to)).toBe(true);
    });
  });

  describe('every possible status pair', () => {
    // Exhaustive 7x7 cross-product: canTransition must agree with the
    // TRANSITIONS map for every pair, not just the valid ones.
    for (const from of allStatuses) {
      for (const to of allStatuses) {
        const expected = TRANSITIONS[from].includes(to);
        it(`${from} -> ${to} is ${expected ? 'valid' : 'invalid'}`, () => {
          expect(machine.canTransition(from, to)).toBe(expected);
        });
      }
    }
  });

  describe('terminal states', () => {
    it.each([OrderStatus.DELIVERED, OrderStatus.CANCELLED])(
      '%s has no valid outgoing transitions',
      (status) => {
        for (const to of allStatuses) {
          expect(machine.canTransition(status, to)).toBe(false);
        }
      },
    );
  });
});
