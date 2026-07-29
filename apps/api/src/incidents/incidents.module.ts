import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IncidentCreationService } from './incident-creation.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [AuthModule],
  controllers: [IncidentsController],
  providers: [IncidentCreationService, IncidentsService],
  exports: [IncidentCreationService, IncidentsService],
})
export class IncidentsModule {}
