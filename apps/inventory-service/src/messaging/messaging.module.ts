import { Global, Module } from '@nestjs/common';
import { RabbitMQModule } from './rabbitmq.module';
import { RabbitMQProducerService } from './rabbitmq-producer.service';

@Global()
@Module({
  imports: [RabbitMQModule],
  providers: [RabbitMQProducerService],
  // RabbitMQModule must be re-exported too, not just RabbitMQProducerService
  // — @Global() only makes a module's own `exports` reachable everywhere;
  // importing RabbitMQModule here doesn't implicitly re-expose its
  // RABBITMQ_CHANNEL token to the rest of the app.
  exports: [RabbitMQModule, RabbitMQProducerService],
})
export class MessagingModule {}
