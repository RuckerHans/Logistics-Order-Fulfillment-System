import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OrderStatus } from '@logistics/contracts';
import { Repository } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { InvalidTransitionException } from './exceptions/invalid-transition.exception';
import { OrderStateMachine } from './order-state-machine';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    private readonly stateMachine: OrderStateMachine,
  ) {}

  async create(dto: CreateOrderDto): Promise<Order> {
    const totalValue = dto.items
      .reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
      .toFixed(2);

    const order = this.ordersRepo.create({
      customerId: dto.customerId,
      deliveryAddress: dto.deliveryAddress,
      branchId: dto.branchId,
      totalValue,
      status: OrderStatus.PLACED,
      items: dto.items.map((item) =>
        Object.assign(new OrderItem(), {
          sku: item.sku,
          qty: item.qty,
          unitPrice: item.unitPrice.toFixed(2),
        }),
      ),
    });

    return this.ordersRepo.save(order);
  }

  findAll(): Promise<Order[]> {
    return this.ordersRepo.find({ relations: ['items'] });
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id }, relations: ['items'] });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async transition(id: string, to: OrderStatus): Promise<Order> {
    const order = await this.findOne(id);

    if (!this.stateMachine.canTransition(order.status, to)) {
      throw new InvalidTransitionException(order.status, to);
    }

    order.status = to;
    return this.ordersRepo.save(order);
  }
}
