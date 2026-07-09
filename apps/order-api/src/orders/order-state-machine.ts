import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@logistics/contracts';

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PLACED]: [OrderStatus.PAYMENT_CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.PAYMENT_CONFIRMED]: [OrderStatus.PICKING],
  [OrderStatus.PICKING]: [OrderStatus.PACKED],
  [OrderStatus.PACKED]: [OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrderStateMachine {
  canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }
}
