import { Controller, Get } from '@nestjs/common';
import { RISK_ENGINE_VERSION } from '@dont-worry/risk-engine';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';

export class ServiceMetadataDto {
  @ApiProperty({ example: 'dont-worry-api' })
  name!: 'dont-worry-api';

  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: '0.1.0' })
  riskEngineVersion!: string;
}

@ApiTags('service')
@Controller()
export class AppController {
  @Get()
  @ApiOkResponse({ type: ServiceMetadataDto })
  getMetadata(): ServiceMetadataDto {
    return {
      name: 'dont-worry-api',
      status: 'ok',
      riskEngineVersion: RISK_ENGINE_VERSION,
    };
  }
}
