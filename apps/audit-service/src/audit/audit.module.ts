import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditKafkaConsumer } from '../messaging/kafka.consumer';
import { AuditService } from './audit.service';
import { OrderStatusLog } from './entities/order-status-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrderStatusLog])],
  providers: [AuditService, AuditKafkaConsumer],
})
export class AuditModule {}
