import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv } from './common/config/env.validation';
import { entities } from './database/entities';
import { JobsModule } from './jobs/jobs.module';
import { MessagingModule } from './messaging/messaging.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        schema: 'order_api',
        entities,
        // Migrations are a separate, explicit step (npm run migration:run,
        // using MIGRATION_DATABASE_URL) — never run automatically here.
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    MessagingModule,
    OrdersModule,
    JobsModule,
  ],
})
export class AppModule {}
