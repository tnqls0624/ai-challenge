import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOkResponse({ type: HealthResponseDto })
  checkLive(): HealthResponseDto {
    return this.healthService.checkLive();
  }

  @Get('ready')
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ description: 'Database is unavailable' })
  checkReady(): Promise<HealthResponseDto> {
    return this.healthService.checkReady();
  }
}
