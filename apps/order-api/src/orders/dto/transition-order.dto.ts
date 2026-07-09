import { OrderStatus } from '@logistics/contracts';
import { IsEnum } from 'class-validator';

export class TransitionOrderDto {
  @IsEnum(OrderStatus)
  newStatus: OrderStatus;
}
