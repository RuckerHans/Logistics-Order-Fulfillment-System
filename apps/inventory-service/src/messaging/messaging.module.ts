import { Global, Module } from '@nestjs/common';
import { RabbitMQModule } from './rabbitmq.module';
import { RabbitMQProducerService } from './rabbitmq-producer.service';

@Global()
@Module({
  imports: [RabbitMQModule],
  providers: [RabbitMQProducerService],
  exports: [RabbitMQProducerService],
})
export class MessagingModule {}
