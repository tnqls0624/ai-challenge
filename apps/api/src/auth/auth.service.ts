import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { GuardianPrincipal } from './authenticated-request';
import type { CreateGuardianSessionRequestDto, GuardianSessionResponseDto } from './auth.dto';
import type { GuardianIdentity } from './guardian-identity';

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createSession(
    identity: GuardianIdentity,
    request: CreateGuardianSessionRequestDto,
  ): Promise<GuardianSessionResponseDto> {
    const guardian = await this.prisma.guardianAccount.upsert({
      where: { firebaseUid: identity.firebaseUid },
      create: {
        displayName: request.displayName,
        email: identity.email,
        firebaseUid: identity.firebaseUid,
      },
      update: {
        displayName: request.displayName,
        email: identity.email,
      },
    });
    return {
      displayName: guardian.displayName,
      email: guardian.email,
      id: guardian.id,
    };
  }

  async findGuardian(firebaseUid: string): Promise<GuardianPrincipal | null> {
    return this.prisma.guardianAccount.findUnique({
      where: { firebaseUid },
      select: {
        displayName: true,
        email: true,
        firebaseUid: true,
        id: true,
      },
    });
  }
}
