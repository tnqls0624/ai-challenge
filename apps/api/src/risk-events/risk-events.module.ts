import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { ExplanationsModule } from '../explanations/explanations.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { RiskEventsController } from './risk-events.controller';
import { RiskEventsService } from './risk-events.service';
import { UrlAnalysisService } from './url-analysis.service';
import {
  URL_REPUTATION_PROVIDER,
  UnavailableUrlReputationProvider,
} from './url-reputation.provider';

@Module({
  imports: [DevicesModule, ExplanationsModule, IncidentsModule],
  controllers: [RiskEventsController],
  providers: [
    RiskEventsService,
    UrlAnalysisService,
    UnavailableUrlReputationProvider,
    {
      provide: URL_REPUTATION_PROVIDER,
      useExisting: UnavailableUrlReputationProvider,
    },
  ],
  exports: [RiskEventsService, URL_REPUTATION_PROVIDER],
})
export class RiskEventsModule {}
