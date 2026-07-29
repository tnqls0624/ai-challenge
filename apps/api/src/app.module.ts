import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { DevicesModule } from './devices/devices.module';
import { validateEnvironment } from './environment/environment';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RiskEventsModule } from './risk-events/risk-events.module';
import { SecurityModule } from './security/security.module';
import { SubjectsModule } from './subjects/subjects.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    SecurityModule,
    AuthModule,
    SubjectsModule,
    DevicesModule,
    RiskEventsModule,
    NotificationsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
