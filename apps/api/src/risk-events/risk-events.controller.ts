import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { DevicePrincipal } from '../auth/authenticated-request';
import { CurrentDevice } from '../devices/current-device';
import { DeviceAuthGuard } from '../devices/device-auth.guard';
import {
  CreateRiskEventRequestDto,
  PostCallSurveyRequestDto,
  PostCallSurveyResponseDto,
  RiskEventResponseDto,
} from './risk-events.dto';
import { RiskEventsService } from './risk-events.service';

@ApiTags('risk-events')
@ApiBearerAuth('deviceCredential')
@UseGuards(DeviceAuthGuard)
@Controller('risk-events')
export class RiskEventsController {
  constructor(
    @Inject(RiskEventsService)
    private readonly riskEventsService: RiskEventsService,
  ) {}

  @Post()
  @ApiBody({ type: CreateRiskEventRequestDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: RiskEventResponseDto })
  create(
    @CurrentDevice() device: DevicePrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() request: CreateRiskEventRequestDto,
  ): Promise<RiskEventResponseDto> {
    return this.riskEventsService.create(device, idempotencyKey ?? '', request);
  }

  @Post(':id/post-call-survey')
  @ApiBody({ type: PostCallSurveyRequestDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: PostCallSurveyResponseDto })
  submitPostCallSurvey(
    @CurrentDevice() device: DevicePrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() request: PostCallSurveyRequestDto,
  ): Promise<PostCallSurveyResponseDto> {
    return this.riskEventsService.submitPostCallSurvey(device, id, idempotencyKey ?? '', request);
  }

  @Get(':id')
  @ApiOkResponse({ type: RiskEventResponseDto })
  findOne(
    @CurrentDevice() device: DevicePrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RiskEventResponseDto> {
    return this.riskEventsService.findOne(device, id);
  }
}
