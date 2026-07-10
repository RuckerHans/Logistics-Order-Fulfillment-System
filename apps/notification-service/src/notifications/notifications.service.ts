import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationChannel, NotificationLog } from './entities/notification-log.entity';

export interface SendNotificationInput {
  orderId: string;
  customerId: string;
  type: string;
  channel: NotificationChannel;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationLog) private readonly logRepo: Repository<NotificationLog>,
  ) {}

  // Simulated send (Section 3: "Simulated email/SMS sending") — no real
  // email/SMS provider integration, just a durable record of what would
  // have been sent, closing the "queue as pseudo-database" gap (Section 21).
  async send(input: SendNotificationInput): Promise<NotificationLog> {
    this.logger.log(
      `Simulated ${input.channel} to customer ${input.customerId}: ${input.type} (order ${input.orderId})`,
    );

    const entry = this.logRepo.create({
      orderId: input.orderId,
      customerId: input.customerId,
      type: input.type,
      channel: input.channel,
      status: 'SENT',
    });
    return this.logRepo.save(entry);
  }
}
