import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotifyConsumer } from '../messaging/notify.consumer';
import { NotificationLog } from './entities/notification-log.entity';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationLog])],
  // NotifyConsumer depends on RABBITMQ_CHANNEL, available here without
  // importing MessagingModule since it's @Global().
  providers: [NotificationsService, NotifyConsumer],
  exports: [NotificationsService],
})
export class NotificationsModule {}
