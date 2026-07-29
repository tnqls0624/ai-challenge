import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { GuardianPrincipal } from '../auth/authenticated-request';
import { PrismaService } from '../database/prisma.service';
import { PushSubscriptionStatus } from '../generated/prisma/enums';
import { EncryptionService } from '../security/encryption.service';
import { TokenService } from '../security/token.service';
import type {
  CreatePushSubscriptionRequestDto,
  PushSubscriptionResponseDto,
} from './push-subscriptions.dto';

@Injectable()
export class PushSubscriptionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EncryptionService)
    private readonly encryption: EncryptionService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async register(
    guardian: GuardianPrincipal,
    request: CreatePushSubscriptionRequestDto,
  ): Promise<PushSubscriptionResponseDto> {
    const tokenDigest = this.tokens.digestPushToken(request.token);
    const existing = await this.prisma.guardianPushSubscription.findUnique({
      where: { tokenDigest },
    });
    if (existing !== null && existing.guardianId !== guardian.id) {
      throw new ConflictException({
        code: 'PUSH_TOKEN_ALREADY_REGISTERED',
        message: 'Push token is already registered to another account',
      });
    }
    const subscription =
      existing === null
        ? await this.prisma.guardianPushSubscription.create({
            data: {
              guardianId: guardian.id,
              tokenCiphertext: this.encryption.encrypt(request.token),
              tokenDigest,
            },
          })
        : await this.prisma.guardianPushSubscription.update({
            where: { id: existing.id },
            data: {
              failureCount: 0,
              revokedAt: null,
              status: PushSubscriptionStatus.ACTIVE,
              tokenCiphertext: this.encryption.encrypt(request.token),
            },
          });
    return toResponse(subscription);
  }

  async revoke(guardian: GuardianPrincipal, id: string): Promise<void> {
    const subscription = await this.prisma.guardianPushSubscription.findFirst({
      where: {
        guardianId: guardian.id,
        id,
      },
    });
    if (subscription === null) {
      throw new NotFoundException({
        code: 'PUSH_SUBSCRIPTION_NOT_FOUND',
        message: 'Push subscription was not found',
      });
    }
    if (subscription.status === PushSubscriptionStatus.REVOKED) {
      return;
    }
    await this.prisma.guardianPushSubscription.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        status: PushSubscriptionStatus.REVOKED,
      },
    });
  }
}

function toResponse(subscription: {
  createdAt: Date;
  id: string;
  status: PushSubscriptionStatus;
}): PushSubscriptionResponseDto {
  return {
    createdAt: subscription.createdAt.toISOString(),
    id: subscription.id,
    status: subscription.status,
  };
}
