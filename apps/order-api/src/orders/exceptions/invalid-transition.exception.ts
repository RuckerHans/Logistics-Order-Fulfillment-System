import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@logistics/contracts';

export class InvalidTransitionException extends BadRequestException {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Cannot transition order from ${from} to ${to}`);
  }
}
