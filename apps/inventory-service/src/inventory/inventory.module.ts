import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryKafkaConsumer } from '../messaging/kafka.consumer';
import { ReserveStockConsumer } from '../messaging/reserve-stock.consumer';
import { Reservation } from './entities/reservation.entity';
import { Stock } from './entities/stock.entity';
import { InventoryService } from './inventory.service';

@Module({
  imports: [TypeOrmModule.forFeature([Stock, Reservation])],
  // ReserveStockConsumer depends on RABBITMQ_CHANNEL / RabbitMQProducerService,
  // both available here without importing MessagingModule since it's @Global().
  providers: [InventoryService, ReserveStockConsumer, InventoryKafkaConsumer],
  exports: [InventoryService],
})
export class InventoryModule {}
