import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { GuardianPrincipal } from '../auth/authenticated-request';
import { CurrentGuardian } from '../auth/current-auth';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { GuardianAccountGuard } from '../auth/guardian-account.guard';
import {
  IncidentResponseDto,
  UpdateActionItemRequestDto,
  UpdateIncidentStageRequestDto,
  UpdateIncidentStatusRequestDto,
} from './incidents.dto';
import { IncidentsService } from './incidents.service';

@ApiTags('incidents')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, GuardianAccountGuard)
@Controller()
export class IncidentsController {
  constructor(
    @Inject(IncidentsService)
    private readonly incidentsService: IncidentsService,
  ) {}

  @Get('incidents')
  @ApiOkResponse({ type: IncidentResponseDto, isArray: true })
  list(@CurrentGuardian() guardian: GuardianPrincipal): Promise<IncidentResponseDto[]> {
    return this.incidentsService.list(guardian);
  }

  @Get('incidents/:id')
  @ApiOkResponse({ type: IncidentResponseDto })
  findOne(
    @CurrentGuardian() guardian: GuardianPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IncidentResponseDto> {
    return this.incidentsService.findOne(guardian, id);
  }

  @Patch('incidents/:id/status')
  @ApiBody({ type: UpdateIncidentStatusRequestDto })
  @ApiOkResponse({ type: IncidentResponseDto })
  updateStatus(
    @CurrentGuardian() guardian: GuardianPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() request: UpdateIncidentStatusRequestDto,
  ): Promise<IncidentResponseDto> {
    return this.incidentsService.updateStatus(guardian, id, request);
  }

  @Patch('incidents/:id/stage')
  @ApiBody({ type: UpdateIncidentStageRequestDto })
  @ApiOkResponse({ type: IncidentResponseDto })
  updateStage(
    @CurrentGuardian() guardian: GuardianPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() request: UpdateIncidentStageRequestDto,
  ): Promise<IncidentResponseDto> {
    return this.incidentsService.updateStage(guardian, id, request);
  }

  @Patch('action-items/:id')
  @ApiBody({ type: UpdateActionItemRequestDto })
  @ApiOkResponse({ type: IncidentResponseDto })
  updateActionItem(
    @CurrentGuardian() guardian: GuardianPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() request: UpdateActionItemRequestDto,
  ): Promise<IncidentResponseDto> {
    return this.incidentsService.updateActionItem(guardian, id, request);
  }
}
