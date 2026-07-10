import { Global, Module } from '@nestjs/common';
import { RabbitMQModule } from './rabbitmq.module';

@Global()
@Module({
  imports: [RabbitMQModule],
  exports: [RabbitMQModule],
})
export class MessagingModule {}
