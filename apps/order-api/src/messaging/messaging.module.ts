import { Global, Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { RabbitMQModule } from './rabbitmq.module';
import { RabbitMQProducerService } from './rabbitmq-producer.service';

@Global()
@Module({
  imports: [RabbitMQModule],
  providers: [RabbitMQProducerService, KafkaProducerService],
  exports: [RabbitMQProducerService, KafkaProducerService],
})
export class MessagingModule {}
