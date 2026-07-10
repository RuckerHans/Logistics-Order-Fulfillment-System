import { Customer } from '../orders/entities/customer.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OutboxEntry } from './entities/outbox-entry.entity';

export const entities = [Customer, Order, OrderItem, OutboxEntry];
