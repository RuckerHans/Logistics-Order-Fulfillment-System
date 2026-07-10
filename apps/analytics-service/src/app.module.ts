import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from './analytics/analytics.module';
import { validateEnv } from './common/config/env.validation';
import { entities } from './database/entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        schema: 'analytics',
        entities,
        // Migrations are a separate, explicit step — never run automatically here.
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    AnalyticsModule,
  ],
})
export class AppModule {}
