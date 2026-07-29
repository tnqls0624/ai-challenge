import { Transform } from 'class-transformer';
import { IsEnum, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CareConnectionStatus, RelationshipRole } from '../generated/prisma/enums';

export class CreateSubjectRequestDto {
  @ApiProperty({ example: '어머니' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  displayName!: string;

  @ApiProperty({ enum: RelationshipRole, example: RelationshipRole.CHILD })
  @IsEnum(RelationshipRole)
  role!: RelationshipRole;
}

export class SubjectResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '어머니' })
  displayName!: string;

  @ApiProperty({ format: 'uuid' })
  careConnectionId!: string;

  @ApiProperty({ enum: CareConnectionStatus })
  careConnectionStatus!: CareConnectionStatus;

  @ApiProperty({ example: 1 })
  version!: number;
}

export class ActivationCodeResponseDto {
  @ApiProperty({
    description: '응답에서 한 번만 제공되는 6자리 활성화 코드',
    example: '123456',
  })
  code!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}
