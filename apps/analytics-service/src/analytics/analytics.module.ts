import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsKafkaConsumer } from '../messaging/kafka.consumer';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { OrderStatusEvent } from './entities/order-status-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrderStatusEvent])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsKafkaConsumer],
})
export class AnalyticsModule {}
