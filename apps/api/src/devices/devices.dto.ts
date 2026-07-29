import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEnum,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AlertThreshold, RelationshipRole, ShareLevel } from '../generated/prisma/enums';

export class ActivationPreviewRequestDto {
  @ApiProperty({ example: '123456', pattern: '^\\d{6}$' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({ example: '4d90589b-6840-4cb2-a02e-ace1b33bf42e' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 128)
  deviceInstallationId!: string;
}

export class ActivationConsentTextVersionsDto {
  @ApiProperty({ example: 'care-connection-v1' })
  careConnection!: string;

  @ApiProperty({ example: 'auto-guardian-alert-v1' })
  autoGuardianAlert!: string;
}

export class ActivationPreviewResponseDto {
  @ApiProperty({ description: '한 번만 제공되는 opaque activation session token' })
  activationSessionId!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ example: '어머니' })
  subjectDisplayName!: string;

  @ApiProperty({ example: '김보호' })
  guardianDisplayName!: string;

  @ApiProperty({ enum: RelationshipRole })
  relationshipRole!: RelationshipRole;

  @ApiProperty({ type: ActivationConsentTextVersionsDto })
  consentTextVersions!: ActivationConsentTextVersionsDto;
}

export class CareConnectionConsentDto {
  @ApiProperty({ enum: [true], example: true })
  @Equals(true)
  granted!: true;

  @ApiProperty({ example: 'care-connection-v1' })
  @IsString()
  @Length(1, 40)
  consentTextVersion!: string;
}

export class AutoGuardianAlertConsentDto {
  @ApiProperty()
  @IsBoolean()
  granted!: boolean;

  @ApiProperty({ enum: AlertThreshold })
  @IsEnum(AlertThreshold)
  threshold!: AlertThreshold;

  @ApiProperty({ example: 'auto-guardian-alert-v1' })
  @IsString()
  @Length(1, 40)
  consentTextVersion!: string;
}

export class ActivationFinalizeRequestDto {
  @ApiProperty({ description: 'preview 응답의 opaque session token' })
  @IsString()
  @Length(32, 128)
  activationSessionId!: string;

  @ApiProperty({ description: 'preview 요청에 사용한 기기 설치 ID' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 128)
  deviceInstallationId!: string;

  @ApiProperty({ description: 'Android Keystore 공개키', minLength: 32 })
  @IsString()
  @Length(32, 4_096)
  devicePublicKey!: string;

  @ApiProperty({ enum: ShareLevel })
  @IsEnum(ShareLevel)
  shareLevel!: ShareLevel;

  @ApiProperty({ type: CareConnectionConsentDto })
  @Type(() => CareConnectionConsentDto)
  @ValidateNested()
  careConnectionConsent!: CareConnectionConsentDto;

  @ApiProperty({ type: AutoGuardianAlertConsentDto })
  @Type(() => AutoGuardianAlertConsentDto)
  @ValidateNested()
  autoGuardianAlertConsent!: AutoGuardianAlertConsentDto;
}

export class ActivationResponseDto {
  @ApiProperty({ format: 'uuid' })
  deviceId!: string;

  @ApiProperty({ description: '한 번만 제공되는 기기 credential' })
  deviceCredential!: string;

  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiProperty({ format: 'uuid' })
  careConnectionId!: string;

  @ApiProperty({ enum: ShareLevel })
  shareLevel!: ShareLevel;

  @ApiProperty({ enum: AlertThreshold })
  autoGuardianAlertThreshold!: AlertThreshold;
}
