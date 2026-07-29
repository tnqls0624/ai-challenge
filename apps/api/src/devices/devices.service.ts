import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ActivationCodeStatus,
  ActivationSessionStatus,
  AlertThreshold,
  CareConnectionStatus,
  ConsentStatus,
  ConsentType,
  DeviceStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TokenService } from '../security/token.service';
import type {
  ActivationFinalizeRequestDto,
  ActivationPreviewRequestDto,
  ActivationPreviewResponseDto,
  ActivationResponseDto,
} from './devices.dto';

const ACTIVATION_SESSION_SCOPE = 'DEVICE_ACTIVATION';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
const CARE_CONNECTION_TEXT_VERSION = 'care-connection-v1';
const AUTO_ALERT_TEXT_VERSION = 'auto-guardian-alert-v1';

@Injectable()
export class DevicesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async preview(request: ActivationPreviewRequestDto): Promise<ActivationPreviewResponseDto> {
    const now = new Date();
    const codeDigest = this.tokens.digestActivationCode(request.code);
    const activationCode = await this.prisma.activationCode.findFirst({
      where: {
        codeDigest,
        status: ActivationCodeStatus.ISSUED,
      },
      include: {
        guardian: true,
        subject: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    if (activationCode === null || activationCode.expiresAt <= now) {
      if (activationCode !== null) {
        await this.invalidateExpiredCode(activationCode.id, now);
      }
      throw invalidActivationCode();
    }
    if (activationCode.attempts >= 5) {
      await this.invalidateExpiredCode(activationCode.id, now);
      throw invalidActivationCode();
    }

    const connection = await this.prisma.careConnection.findUnique({
      where: {
        guardianId_subjectId: {
          guardianId: activationCode.guardianId,
          subjectId: activationCode.subjectId,
        },
      },
    });
    if (connection === null || connection.status !== CareConnectionStatus.PENDING_CONSENT) {
      throw invalidActivationCode();
    }

    const sessionToken = this.tokens.generateOpaqueToken();
    const session = await this.prisma.$transaction(
      async (transaction) => {
        const claim = await transaction.activationCode.updateMany({
          where: {
            attempts: { lt: 5 },
            expiresAt: { gt: now },
            id: activationCode.id,
            status: ActivationCodeStatus.ISSUED,
          },
          data: {
            attempts: { increment: 1 },
            lastAttemptAt: now,
          },
        });
        if (claim.count !== 1) {
          throw invalidActivationCode();
        }
        await transaction.activationSession.updateMany({
          where: {
            activationCodeId: activationCode.id,
            status: ActivationSessionStatus.ISSUED,
          },
          data: {
            invalidatedAt: now,
            status: ActivationSessionStatus.INVALIDATED,
          },
        });
        return transaction.activationSession.create({
          data: {
            activationCodeId: activationCode.id,
            deviceInstallationDigest: this.tokens.digestDeviceInstallation(
              request.deviceInstallationId,
            ),
            expiresAt: activationCode.expiresAt,
            tokenDigest: this.tokens.digestOpaqueToken(sessionToken),
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return {
      activationSessionId: sessionToken,
      consentTextVersions: {
        autoGuardianAlert: AUTO_ALERT_TEXT_VERSION,
        careConnection: CARE_CONNECTION_TEXT_VERSION,
      },
      expiresAt: session.expiresAt.toISOString(),
      guardianDisplayName: activationCode.guardian.displayName,
      relationshipRole: connection.role,
      subjectDisplayName: activationCode.subject.displayName,
    };
  }

  async activate(
    idempotencyKey: string,
    request: ActivationFinalizeRequestDto,
  ): Promise<ActivationResponseDto> {
    assertIdempotencyKey(idempotencyKey);
    assertConsentCombination(request);

    const keyDigest = this.tokens.digestIdempotencyKey(ACTIVATION_SESSION_SCOPE, idempotencyKey);
    const requestDigest = this.requestDigest(request);
    const sessionDigest = this.tokens.digestOpaqueToken(request.activationSessionId);
    const session = await this.prisma.activationSession.findUnique({
      where: { tokenDigest: sessionDigest },
      include: { activationCode: true },
    });
    if (session === null) {
      throw invalidActivationSession();
    }
    if (
      session.deviceInstallationDigest !==
      this.tokens.digestDeviceInstallation(request.deviceInstallationId)
    ) {
      throw invalidActivationSession();
    }

    const replay = await this.findIdempotentResponse(
      session.id,
      idempotencyKey,
      keyDigest,
      requestDigest,
    );
    if (replay !== null) {
      return replay;
    }

    const now = new Date();
    if (
      session.status !== ActivationSessionStatus.ISSUED ||
      session.expiresAt <= now ||
      session.activationCode.status !== ActivationCodeStatus.ISSUED ||
      session.activationCode.expiresAt <= now
    ) {
      throw invalidActivationSession();
    }

    const deviceCredential = this.tokens.deriveDeviceCredential(session.id, idempotencyKey);
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const sessionClaim = await transaction.activationSession.updateMany({
            where: {
              expiresAt: { gt: now },
              id: session.id,
              status: ActivationSessionStatus.ISSUED,
            },
            data: {
              consumedAt: now,
              status: ActivationSessionStatus.CONSUMED,
            },
          });
          const codeClaim = await transaction.activationCode.updateMany({
            where: {
              expiresAt: { gt: now },
              id: session.activationCodeId,
              status: ActivationCodeStatus.ISSUED,
            },
            data: {
              consumedAt: now,
              status: ActivationCodeStatus.CONSUMED,
            },
          });
          if (sessionClaim.count !== 1 || codeClaim.count !== 1) {
            throw invalidActivationSession();
          }

          const connection = await transaction.careConnection.findUnique({
            where: {
              guardianId_subjectId: {
                guardianId: session.activationCode.guardianId,
                subjectId: session.activationCode.subjectId,
              },
            },
          });
          if (connection === null || connection.status !== CareConnectionStatus.PENDING_CONSENT) {
            throw invalidActivationSession();
          }

          const activatedConnection = await transaction.careConnection.update({
            where: { id: connection.id },
            data: {
              activatedAt: now,
              autoAlertThreshold: request.autoGuardianAlertConsent.threshold,
              shareLevel: request.shareLevel,
              status: CareConnectionStatus.ACTIVE,
            },
          });
          const device = await transaction.device.create({
            data: {
              activatedAt: now,
              credentialDigest: this.tokens.digestDeviceCredential(deviceCredential),
              publicKeyFingerprint: this.tokens.fingerprintPublicKey(request.devicePublicKey),
              status: DeviceStatus.ACTIVE,
              subjectId: session.activationCode.subjectId,
            },
          });
          await transaction.consent.createMany({
            data: [
              {
                connectionId: connection.id,
                deviceId: device.id,
                grantedAt: now,
                scope: {
                  shareLevel: request.shareLevel,
                },
                status: ConsentStatus.GRANTED,
                subjectId: session.activationCode.subjectId,
                textVersion: request.careConnectionConsent.consentTextVersion,
                type: ConsentType.CARE_CONNECTION,
              },
              {
                connectionId: connection.id,
                deviceId: device.id,
                grantedAt: request.autoGuardianAlertConsent.granted ? now : null,
                revokedAt: request.autoGuardianAlertConsent.granted ? null : now,
                scope: {
                  threshold: request.autoGuardianAlertConsent.threshold,
                },
                status: request.autoGuardianAlertConsent.granted
                  ? ConsentStatus.GRANTED
                  : ConsentStatus.REVOKED,
                subjectId: session.activationCode.subjectId,
                textVersion: request.autoGuardianAlertConsent.consentTextVersion,
                type: ConsentType.AUTO_GUARDIAN_ALERT,
              },
            ],
          });
          await transaction.idempotencyRecord.create({
            data: {
              expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
              guardianId: session.activationCode.guardianId,
              keyDigest,
              requestDigest,
              resourceId: device.id,
              responseStatus: 201,
              scope: ACTIVATION_SESSION_SCOPE,
            },
          });

          return {
            autoGuardianAlertThreshold: activatedConnection.autoAlertThreshold,
            careConnectionId: activatedConnection.id,
            deviceCredential,
            deviceId: device.id,
            shareLevel: activatedConnection.shareLevel,
            subjectId: device.subjectId,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      const racedReplay = await this.findIdempotentResponse(
        session.id,
        idempotencyKey,
        keyDigest,
        requestDigest,
      );
      if (racedReplay !== null) {
        return racedReplay;
      }
      if (isUniqueConstraintError(error)) {
        throw new ConflictException({
          code: 'ACTIVATION_CONFLICT',
          message: 'The device or care connection is already active',
        });
      }
      throw error;
    }
  }

  async rejectSession(sessionToken: string): Promise<void> {
    const session = await this.prisma.activationSession.findUnique({
      where: {
        tokenDigest: this.tokens.digestOpaqueToken(sessionToken),
      },
    });
    if (session === null) {
      return;
    }
    if (session.status === ActivationSessionStatus.CONSUMED) {
      throw new ConflictException({
        code: 'ACTIVATION_ALREADY_COMPLETED',
        message: 'A completed activation cannot be rejected',
      });
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.activationSession.updateMany({
        where: {
          id: session.id,
          status: ActivationSessionStatus.ISSUED,
        },
        data: {
          invalidatedAt: now,
          status: ActivationSessionStatus.INVALIDATED,
        },
      }),
      this.prisma.activationCode.updateMany({
        where: {
          id: session.activationCodeId,
          status: ActivationCodeStatus.ISSUED,
        },
        data: {
          invalidatedAt: now,
          status: ActivationCodeStatus.INVALIDATED,
        },
      }),
    ]);
  }

  private async invalidateExpiredCode(codeId: string, now: Date): Promise<void> {
    await this.prisma.activationCode.updateMany({
      where: {
        id: codeId,
        status: ActivationCodeStatus.ISSUED,
      },
      data: {
        invalidatedAt: now,
        status: ActivationCodeStatus.INVALIDATED,
      },
    });
  }

  private async findIdempotentResponse(
    sessionId: string,
    idempotencyKey: string,
    keyDigest: string,
    requestDigest: string,
  ): Promise<ActivationResponseDto | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        scope_keyDigest: {
          keyDigest,
          scope: ACTIVATION_SESSION_SCOPE,
        },
      },
    });
    if (record === null) {
      return null;
    }
    if (record.requestDigest !== requestDigest) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency-Key was already used with a different request',
      });
    }
    const device = await this.prisma.device.findUnique({
      where: { id: record.resourceId },
    });
    if (device === null) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_RESOURCE_MISSING',
        message: 'The idempotent activation result is unavailable',
      });
    }
    const connection = await this.prisma.careConnection.findFirst({
      where: {
        status: CareConnectionStatus.ACTIVE,
        subjectId: device.subjectId,
      },
    });
    if (connection === null) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_RESOURCE_MISSING',
        message: 'The idempotent activation result is unavailable',
      });
    }
    return {
      autoGuardianAlertThreshold: connection.autoAlertThreshold,
      careConnectionId: connection.id,
      deviceCredential: this.tokens.deriveDeviceCredential(sessionId, idempotencyKey),
      deviceId: device.id,
      shareLevel: connection.shareLevel,
      subjectId: device.subjectId,
    };
  }

  private requestDigest(request: ActivationFinalizeRequestDto): string {
    return this.tokens.digestRequest(
      JSON.stringify({
        activationSessionId: request.activationSessionId,
        autoGuardianAlertConsent: {
          consentTextVersion: request.autoGuardianAlertConsent.consentTextVersion,
          granted: request.autoGuardianAlertConsent.granted,
          threshold: request.autoGuardianAlertConsent.threshold,
        },
        careConnectionConsent: {
          consentTextVersion: request.careConnectionConsent.consentTextVersion,
          granted: request.careConnectionConsent.granted,
        },
        deviceInstallationId: request.deviceInstallationId,
        devicePublicKey: request.devicePublicKey,
        shareLevel: request.shareLevel,
      }),
    );
  }
}

function assertIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9._~-]{16,128}$/.test(value)) {
    throw new UnprocessableEntityException({
      code: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key must contain 16 to 128 URL-safe characters',
    });
  }
}

function assertConsentCombination(request: ActivationFinalizeRequestDto): void {
  if (
    request.careConnectionConsent.consentTextVersion !== CARE_CONNECTION_TEXT_VERSION ||
    request.autoGuardianAlertConsent.consentTextVersion !== AUTO_ALERT_TEXT_VERSION
  ) {
    throw new UnprocessableEntityException({
      code: 'CONSENT_TEXT_VERSION_MISMATCH',
      message: 'Consent text version is not current',
    });
  }

  const { granted, threshold } = request.autoGuardianAlertConsent;
  const isValid =
    (!granted && threshold === AlertThreshold.NONE) ||
    (granted && (threshold === AlertThreshold.HIGH || threshold === AlertThreshold.CRITICAL));
  if (!isValid) {
    throw new UnprocessableEntityException({
      code: 'INVALID_AUTO_ALERT_CONSENT',
      message: 'Auto guardian alert consent and threshold do not match',
    });
  }
}

function invalidActivationCode(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'ACTIVATION_CODE_INVALID',
    message: 'Activation code is invalid, expired, or already used',
  });
}

function invalidActivationSession(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'ACTIVATION_SESSION_INVALID',
    message: 'Activation session is invalid, expired, or already used',
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
