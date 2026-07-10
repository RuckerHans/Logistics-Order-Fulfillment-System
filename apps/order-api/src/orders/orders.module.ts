import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStateMachine } from './order-state-machine';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ReplyQueueConsumer } from './reply-queue.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Customer])],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStateMachine, ReplyQueueConsumer],
  exports: [OrdersService],
})
export class OrdersModule {}
