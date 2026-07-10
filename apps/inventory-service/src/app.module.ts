import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv } from './common/config/env.validation';
import { entities } from './database/entities';
import { InventoryModule } from './inventory/inventory.module';
import { MessagingModule } from './messaging/messaging.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        schema: 'inventory',
        entities,
        // Migrations are a separate, explicit step — never run automatically here.
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    MessagingModule,
    InventoryModule,
  ],
})
export class AppModule {}
