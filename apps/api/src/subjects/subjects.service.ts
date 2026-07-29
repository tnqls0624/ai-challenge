import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivationCodeStatus, CareConnectionStatus } from '../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';
import { TokenService } from '../security/token.service';
import type { GuardianPrincipal } from '../auth/authenticated-request';
import type {
  ActivationCodeResponseDto,
  CreateSubjectRequestDto,
  SubjectResponseDto,
} from './subjects.dto';

const ACTIVATION_CODE_TTL_MS = 10 * 60 * 1_000;
const CODE_GENERATION_ATTEMPTS = 10;

@Injectable()
export class SubjectsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async createSubject(
    guardian: GuardianPrincipal,
    request: CreateSubjectRequestDto,
  ): Promise<SubjectResponseDto> {
    return this.prisma.$transaction(async (transaction) => {
      const subject = await transaction.subjectProfile.create({
        data: {
          displayName: request.displayName,
        },
      });
      const connection = await transaction.careConnection.create({
        data: {
          guardianId: guardian.id,
          role: request.role,
          subjectId: subject.id,
        },
      });

      return {
        careConnectionId: connection.id,
        careConnectionStatus: connection.status,
        displayName: subject.displayName,
        id: subject.id,
        version: subject.version,
      };
    });
  }

  async issueActivationCode(
    guardian: GuardianPrincipal,
    subjectId: string,
  ): Promise<ActivationCodeResponseDto> {
    const connection = await this.prisma.careConnection.findUnique({
      where: {
        guardianId_subjectId: {
          guardianId: guardian.id,
          subjectId,
        },
      },
      select: {
        status: true,
      },
    });
    if (connection === null) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: 'Subject was not found',
      });
    }
    if (connection.status !== CareConnectionStatus.PENDING_CONSENT) {
      throw new ForbiddenException({
        code: 'ACTIVATION_NOT_ALLOWED',
        message: 'Only a pending connection can issue an activation code',
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACTIVATION_CODE_TTL_MS);
    await this.prisma.activationCode.updateMany({
      where: {
        status: ActivationCodeStatus.ISSUED,
        subjectId,
      },
      data: {
        invalidatedAt: now,
        status: ActivationCodeStatus.INVALIDATED,
      },
    });

    for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt += 1) {
      const code = this.tokens.generateActivationCode();
      try {
        await this.prisma.activationCode.create({
          data: {
            codeDigest: this.tokens.digestActivationCode(code),
            expiresAt,
            guardianId: guardian.id,
            subjectId,
          },
        });
        return {
          code,
          expiresAt: expiresAt.toISOString(),
        };
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
      }
    }

    throw new ConflictException({
      code: 'ACTIVATION_CODE_CAPACITY_EXHAUSTED',
      message: 'Could not allocate an activation code',
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
