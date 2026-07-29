import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ActivationPreviewRateLimiter } from './activation-preview-rate-limiter';
import {
  ActivationFinalizeRequestDto,
  ActivationPreviewRequestDto,
  ActivationPreviewResponseDto,
  ActivationResponseDto,
} from './devices.dto';
import { DevicesService } from './devices.service';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(
    @Inject(DevicesService) private readonly devicesService: DevicesService,
    @Inject(ActivationPreviewRateLimiter)
    private readonly rateLimiter: ActivationPreviewRateLimiter,
  ) {}

  @Post('activation-previews')
  @ApiBody({ type: ActivationPreviewRequestDto })
  @ApiCreatedResponse({ type: ActivationPreviewResponseDto })
  preview(
    @Ip() ipAddress: string,
    @Body() request: ActivationPreviewRequestDto,
  ): Promise<ActivationPreviewResponseDto> {
    this.rateLimiter.assertAllowed(ipAddress, request.deviceInstallationId);
    return this.devicesService.preview(request);
  }

  @Post('activate')
  @ApiBody({ type: ActivationFinalizeRequestDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: ActivationResponseDto })
  activate(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() request: ActivationFinalizeRequestDto,
  ): Promise<ActivationResponseDto> {
    return this.devicesService.activate(idempotencyKey ?? '', request);
  }

  @Delete('activation-sessions/:sessionToken')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  rejectSession(@Param('sessionToken') sessionToken: string): Promise<void> {
    return this.devicesService.rejectSession(sessionToken);
  }
}
