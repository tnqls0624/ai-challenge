import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGuardianSessionRequestDto {
  @ApiProperty({ example: '김보호' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  displayName!: string;
}

export class GuardianSessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '김보호' })
  displayName!: string;

  @ApiProperty({ example: 'guardian@example.com', nullable: true })
  email!: string | null;
}
