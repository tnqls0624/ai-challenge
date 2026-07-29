import { IsBoolean, IsIn, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IncidentStage,
  IncidentStatus,
  RiskEventType,
  RiskLevel,
  ShareLevel,
} from '../generated/prisma/enums';

export class IncidentActionItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'STOP_CONTACT' })
  actionId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ['PENDING', 'COMPLETED'] })
  status!: 'PENDING' | 'COMPLETED';

  @ApiProperty()
  sortOrder!: number;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  completedAt!: string | null;
}

export class IncidentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiProperty()
  subjectDisplayName!: string;

  @ApiProperty({ enum: ShareLevel })
  shareLevel!: ShareLevel;

  @ApiProperty({ enum: RiskLevel })
  riskLevel!: RiskLevel;

  @ApiProperty({ enum: RiskEventType })
  eventType!: RiskEventType;

  @ApiProperty({ enum: IncidentStatus })
  status!: IncidentStatus;

  @ApiPropertyOptional({ enum: IncidentStage, nullable: true })
  stage!: IncidentStage | null;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  senderMasked!: string | null;

  @ApiPropertyOptional({ nullable: true })
  summary!: string | null;

  @ApiPropertyOptional({ enum: ['TEMPLATE', 'OPENAI'], nullable: true })
  summarySource!: 'TEMPLATE' | 'OPENAI' | null;

  @ApiProperty({ type: String, isArray: true })
  signalTypes!: string[];

  @ApiProperty({ type: IncidentActionItemResponseDto, isArray: true })
  actionItems!: IncidentActionItemResponseDto[];

  @ApiPropertyOptional({
    enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'],
    nullable: true,
  })
  notificationStatus!: string | null;
}

export class UpdateIncidentStatusRequestDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({
    enum: [
      IncidentStatus.ACKNOWLEDGED,
      IncidentStatus.IN_PROGRESS,
      IncidentStatus.ESCALATED,
      IncidentStatus.RESOLVED,
    ],
  })
  @IsIn([
    IncidentStatus.ACKNOWLEDGED,
    IncidentStatus.IN_PROGRESS,
    IncidentStatus.ESCALATED,
    IncidentStatus.RESOLVED,
  ])
  status!:
    | typeof IncidentStatus.ACKNOWLEDGED
    | typeof IncidentStatus.ESCALATED
    | typeof IncidentStatus.IN_PROGRESS
    | typeof IncidentStatus.RESOLVED;
}

export class UpdateIncidentStageRequestDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: IncidentStage })
  @IsIn([IncidentStage.S0, IncidentStage.S1, IncidentStage.S2, IncidentStage.S3, IncidentStage.S4])
  stage!: IncidentStage;
}

export class UpdateActionItemRequestDto {
  @ApiProperty()
  @IsBoolean()
  completed!: boolean;
}
