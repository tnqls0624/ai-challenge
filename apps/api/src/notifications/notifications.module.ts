import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OutboxWorker } from './outbox.worker';
import { FirebasePushProvider, PUSH_PROVIDER } from './push.provider';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { PushSubscriptionsService } from './push-subscriptions.service';

@Module({
  imports: [AuthModule],
  controllers: [PushSubscriptionsController],
  providers: [
    FirebasePushProvider,
    OutboxWorker,
    PushSubscriptionsService,
    {
      provide: PUSH_PROVIDER,
      useExisting: FirebasePushProvider,
    },
  ],
  exports: [OutboxWorker, PUSH_PROVIDER],
})
export class NotificationsModule {}
