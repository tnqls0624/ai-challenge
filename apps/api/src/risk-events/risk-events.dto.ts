import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ANALYSIS_COMPLETENESS,
  ANALYSIS_CONFIDENCES,
  RISK_CATEGORIES,
  RISK_EVENT_TYPES,
  RISK_LEVELS,
  RISK_SIGNAL_GROUPS,
  RISK_SIGNAL_TYPES,
} from '@dont-worry/contracts';

export const IMPERSONATED_ENTITY_TYPES = [
  'PUBLIC_AGENCY',
  'LAW_ENFORCEMENT',
  'FINANCIAL_INSTITUTION',
  'FAMILY',
  'DELIVERY',
] as const;

export const RISK_KEYWORD_IDS = [
  'URGENCY',
  'FEAR',
  'SECRECY',
  'PAYMENT_REQUEST',
  'APP_INSTALL',
  'REMOTE_CONTROL',
  'SECRET_REQUEST',
] as const;

export class RiskEventSenderDto {
  @ApiProperty({ example: '010-****-1234' })
  @IsString()
  @Length(3, 40)
  masked!: string;

  @ApiProperty({ description: '평판 조회 후 즉시 폐기되는 E.164 번호', example: '+821012341234' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  normalized!: string;
}

export class RiskEventUrlDto {
  @ApiProperty({ example: 'https://example.invalid/pay?case=fixture', maxLength: 2_048 })
  @IsString()
  @Length(1, 2_048)
  canonical!: string;

  @ApiProperty({ example: 'example.invalid' })
  @IsString()
  @Length(1, 253)
  normalizedDomain!: string;

  @ApiProperty({ description: 'canonical URL의 SHA-256 hex' })
  @Matches(/^[a-f0-9]{64}$/)
  normalizedUrlHash!: string;
}

export class RiskEventFeaturesDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  contentAvailable!: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  extractionComplete!: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  contentTruncated!: boolean;

  @ApiProperty({ minimum: 0, maximum: 20_000 })
  @IsInt()
  @Min(0)
  @Max(20_000)
  normalizedLength!: number;

  @ApiProperty({ enum: IMPERSONATED_ENTITY_TYPES, isArray: true })
  @IsArray()
  @ArrayMaxSize(IMPERSONATED_ENTITY_TYPES.length)
  @IsIn(IMPERSONATED_ENTITY_TYPES, { each: true })
  impersonatedEntityTypes!: Array<(typeof IMPERSONATED_ENTITY_TYPES)[number]>;

  @ApiProperty({ enum: RISK_KEYWORD_IDS, isArray: true })
  @IsArray()
  @ArrayMaxSize(RISK_KEYWORD_IDS.length)
  @IsIn(RISK_KEYWORD_IDS, { each: true })
  riskKeywordIds!: Array<(typeof RISK_KEYWORD_IDS)[number]>;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  requestsPayment!: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  requestsAppInstall!: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  requestsRemoteControl!: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  requestsSecret!: boolean;
}

export class LocalRiskDecisionDto {
  @ApiProperty({ enum: RISK_LEVELS.filter((level) => level !== 'UNKNOWN') })
  @IsIn(RISK_LEVELS.filter((level) => level !== 'UNKNOWN'))
  level!: 'SAFE' | 'CAUTION' | 'HIGH' | 'CRITICAL';
}

export class CreateRiskEventRequestDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  schemaVersion!: number;

  @ApiProperty({ example: '2026-07-28.1' })
  @IsString()
  @Length(1, 40)
  policyVersion!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  eventId!: string;

  @ApiProperty({ enum: RISK_EVENT_TYPES })
  @IsIn(RISK_EVENT_TYPES)
  type!: (typeof RISK_EVENT_TYPES)[number];

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  occurredAt!: string;

  @ApiPropertyOptional({ type: RiskEventSenderDto })
  @IsOptional()
  @Type(() => RiskEventSenderDto)
  @ValidateNested()
  sender?: RiskEventSenderDto;

  @ApiProperty({ type: RiskEventUrlDto, isArray: true, maxItems: 5 })
  @IsArray()
  @ArrayMaxSize(5)
  @Type(() => RiskEventUrlDto)
  @ValidateNested({ each: true })
  urls!: RiskEventUrlDto[];

  @ApiProperty({ type: RiskEventFeaturesDto })
  @Type(() => RiskEventFeaturesDto)
  @ValidateNested()
  features!: RiskEventFeaturesDto;

  @ApiPropertyOptional({ type: LocalRiskDecisionDto })
  @IsOptional()
  @Type(() => LocalRiskDecisionDto)
  @ValidateNested()
  localDecision?: LocalRiskDecisionDto;

  @ApiPropertyOptional({
    description: 'RAW_SERVER_ANALYSIS 동의가 있을 때만 메모리에서 분석하고 저장하지 않음',
    maxLength: 2_000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  rawText?: string;
}

export class RiskSignalResponseDto {
  @ApiProperty({ enum: RISK_SIGNAL_TYPES })
  type!: (typeof RISK_SIGNAL_TYPES)[number];

  @ApiProperty({ enum: RISK_SIGNAL_GROUPS })
  group!: (typeof RISK_SIGNAL_GROUPS)[number];

  @ApiProperty({ minimum: 0, maximum: 100 })
  score!: number;

  @ApiProperty()
  evidence!: string;

  @ApiProperty({
    enum: ['CORRELATION', 'KISA', 'PHONE_REPUTATION', 'RULE', 'SAFE_BROWSING', 'USER'],
  })
  source!: string;
}

export class RiskEventResponseDto {
  @ApiProperty({ format: 'uuid', description: '서버 RiskEvent 식별자' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: '기기가 생성한 멱등 이벤트 식별자' })
  eventId!: string;

  @ApiProperty({ enum: RISK_LEVELS })
  level!: (typeof RISK_LEVELS)[number];

  @ApiProperty({ nullable: true, minimum: 0, maximum: 100 })
  score!: number | null;

  @ApiProperty({ enum: RISK_CATEGORIES })
  category!: (typeof RISK_CATEGORIES)[number];

  @ApiProperty({ enum: ANALYSIS_CONFIDENCES })
  confidence!: (typeof ANALYSIS_CONFIDENCES)[number];

  @ApiProperty({ enum: ANALYSIS_COMPLETENESS })
  completeness!: (typeof ANALYSIS_COMPLETENESS)[number];

  @ApiProperty()
  policyVersion!: string;

  @ApiProperty({ type: RiskSignalResponseDto, isArray: true })
  signals!: RiskSignalResponseDto[];

  @ApiProperty({ type: String, isArray: true })
  recommendedActionIds!: string[];

  @ApiProperty()
  explanationTitle!: string;

  @ApiProperty()
  explanationBody!: string;

  @ApiProperty({ enum: ['TEMPLATE', 'OPENAI'] })
  explanationSource!: 'TEMPLATE' | 'OPENAI';

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class PostCallSurveyRequestDto {
  @ApiProperty()
  @IsBoolean()
  requestedPayment!: boolean;

  @ApiProperty()
  @IsBoolean()
  requestedAppInstall!: boolean;

  @ApiProperty()
  @IsBoolean()
  requestedRemoteControl!: boolean;

  @ApiProperty()
  @IsBoolean()
  requestedSecret!: boolean;

  @ApiProperty()
  @IsBoolean()
  clickedLink!: boolean;

  @ApiProperty()
  @IsBoolean()
  enteredPersonalInformation!: boolean;

  @ApiProperty()
  @IsBoolean()
  installedApp!: boolean;

  @ApiProperty()
  @IsBoolean()
  transferredMoney!: boolean;
}

export class PostCallSurveyResponseDto extends RiskEventResponseDto {
  @ApiPropertyOptional({ enum: ['S0', 'S1', 'S2', 'S3', 'S4'], nullable: true })
  incidentStage!: 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | null;
}
