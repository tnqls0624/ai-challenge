import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PushSubscriptionStatus } from '../generated/prisma/enums';

export class CreatePushSubscriptionRequestDto {
  @ApiProperty({
    description: 'Firebase Cloud Messaging browser registration token',
    minLength: 20,
    maxLength: 4_096,
  })
  @IsString()
  @Length(20, 4_096)
  token!: string;
}

export class PushSubscriptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: PushSubscriptionStatus })
  status!: PushSubscriptionStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
