import { Module } from '@nestjs/common';
import { ActivationPreviewRateLimiter } from './activation-preview-rate-limiter';
import { DeviceAuthGuard } from './device-auth.guard';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  controllers: [DevicesController],
  providers: [ActivationPreviewRateLimiter, DeviceAuthGuard, DevicesService],
  exports: [DeviceAuthGuard],
})
export class DevicesModule {}
