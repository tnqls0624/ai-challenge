import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import {
  CareConnectionStatus,
  NotificationDeliveryStatus,
  NotificationOutboxStatus,
  Prisma,
  PushSubscriptionStatus,
} from '../generated/prisma/client';
import { allowsAutomaticNotification } from '../incidents/incident-creation.service';
import { EncryptionService } from '../security/encryption.service';
import {
  PUSH_PROVIDER,
  PushDeliveryError,
  type PushNotification,
  type PushProvider,
} from './push.provider';

const MAX_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 1_000;
const RETRY_DELAYS_MS = [0, 5_000, 30_000, 120_000, 600_000, 1_800_000] as const;
const LAST_RETRY_DELAY_MS = 1_800_000;

type ClaimedRow = {
  id: string;
};

type DeliveryResult = {
  errorCode: string | null;
  permanent: boolean;
  providerMessageId: string | null;
  subscriptionId: string;
};

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly enabled: boolean;
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private interval: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EncryptionService)
    private readonly encryption: EncryptionService,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: PushProvider,
  ) {
    this.enabled = configService.get<boolean>('WORKER_ENABLED') ?? false;
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.interval = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval !== undefined) {
      clearInterval(this.interval);
    }
  }

  async processBatch(limit = 20): Promise<number> {
    const ids = await this.claim(limit);
    await Promise.all(
      ids.map(async (id) => {
        try {
          await this.processOne(id);
        } catch {
          await this.rescheduleUnexpected(id);
        }
      }),
    );
    return ids.length;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processBatch();
    } catch {
      // The next interval retries database-level failures without logging payload data.
    } finally {
      this.running = false;
    }
  }

  private async claim(limit: number): Promise<string[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "notification_outbox"
        WHERE (
          "status" = 'PENDING'
          AND "next_attempt_at" <= NOW()
        ) OR (
          "status" = 'PROCESSING'
          AND "locked_at" < NOW() - INTERVAL '30 seconds'
        )
        ORDER BY "next_attempt_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${boundedLimit}
      )
      UPDATE "notification_outbox" AS outbox
      SET
        "attempt_count" = outbox."attempt_count" + 1,
        "last_error_code" = NULL,
        "locked_at" = NOW(),
        "lock_owner" = ${this.workerId},
        "status" = 'PROCESSING'
      FROM candidates
      WHERE outbox."id" = candidates."id"
      RETURNING outbox."id"
    `);
    return rows.map((row) => row.id);
  }

  private async processOne(id: string): Promise<void> {
    const outbox = await this.prisma.notificationOutbox.findFirst({
      where: {
        id,
        lockOwner: this.workerId,
        status: NotificationOutboxStatus.PROCESSING,
      },
      include: {
        connection: true,
        guardian: {
          include: {
            pushSubscriptions: {
              where: { status: PushSubscriptionStatus.ACTIVE },
            },
          },
        },
        incident: {
          include: {
            riskEvent: true,
            subject: true,
          },
        },
      },
    });
    if (outbox === null) return;

    const riskLevel = outbox.incident.riskEvent.riskLevel;
    if (
      (riskLevel !== 'HIGH' && riskLevel !== 'CRITICAL') ||
      outbox.connection.status !== CareConnectionStatus.ACTIVE ||
      !outbox.connection.pushEnabled ||
      !allowsAutomaticNotification(
        riskLevel,
        outbox.connection.autoAlertThreshold,
        outbox.connection.guardianReceiveThreshold,
      )
    ) {
      await this.cancel(id, 'POLICY_NO_LONGER_ALLOWS');
      return;
    }
    if (outbox.guardian.pushSubscriptions.length === 0) {
      await this.cancel(id, 'NO_ACTIVE_PUSH_SUBSCRIPTION');
      return;
    }

    const notification: PushNotification = {
      incidentId: outbox.incidentId,
      notificationId: outbox.id,
      riskLevel,
      subjectDisplayName: outbox.incident.subject.displayName,
    };
    const results = await Promise.all(
      outbox.guardian.pushSubscriptions.map(async (subscription) => {
        try {
          const token = this.encryption.decrypt(subscription.tokenCiphertext);
          const result = await this.pushProvider.send(token, notification);
          return {
            errorCode: null,
            permanent: false,
            providerMessageId: result.providerMessageId,
            subscriptionId: subscription.id,
          } satisfies DeliveryResult;
        } catch (error) {
          return {
            errorCode: error instanceof PushDeliveryError ? error.code : 'PUSH_DELIVERY_ERROR',
            permanent: error instanceof PushDeliveryError ? error.permanent : true,
            providerMessageId: null,
            subscriptionId: subscription.id,
          } satisfies DeliveryResult;
        }
      }),
    );
    await this.persistResults(outbox.id, outbox.attemptCount, results);
  }

  private async persistResults(
    outboxId: string,
    attempt: number,
    results: readonly DeliveryResult[],
  ): Promise<void> {
    const now = new Date();
    const anySuccess = results.some((result) => result.providerMessageId !== null);
    const hasTransientFailure = results.some(
      (result) => result.errorCode !== null && !result.permanent,
    );
    await this.prisma.$transaction(async (transaction) => {
      await transaction.notificationDelivery.createMany({
        data: results.map((result) => ({
          attempt,
          errorCode: result.errorCode,
          outboxId,
          providerMessageId: result.providerMessageId,
          pushSubscriptionId: result.subscriptionId,
          status:
            result.providerMessageId === null
              ? NotificationDeliveryStatus.FAILED
              : NotificationDeliveryStatus.SENT,
        })),
      });
      for (const result of results) {
        if (result.providerMessageId !== null) {
          await transaction.guardianPushSubscription.update({
            where: { id: result.subscriptionId },
            data: {
              failureCount: 0,
              lastUsedAt: now,
            },
          });
        } else if (result.permanent) {
          await transaction.guardianPushSubscription.update({
            where: { id: result.subscriptionId },
            data: {
              failureCount: { increment: 1 },
              revokedAt: now,
              status: PushSubscriptionStatus.INVALID,
            },
          });
        } else {
          await transaction.guardianPushSubscription.update({
            where: { id: result.subscriptionId },
            data: {
              failureCount: { increment: 1 },
            },
          });
        }
      }

      if (anySuccess) {
        await transaction.notificationOutbox.update({
          where: { id: outboxId },
          data: {
            lastErrorCode: null,
            lockedAt: null,
            lockOwner: null,
            sentAt: now,
            status: NotificationOutboxStatus.SENT,
          },
        });
        return;
      }
      const errorCode =
        results.find((result) => result.errorCode !== null)?.errorCode ?? 'PUSH_DELIVERY_ERROR';
      if (hasTransientFailure && attempt < MAX_ATTEMPTS) {
        await transaction.notificationOutbox.update({
          where: { id: outboxId },
          data: {
            lastErrorCode: errorCode,
            lockedAt: null,
            lockOwner: null,
            nextAttemptAt: new Date(now.getTime() + retryDelay(attempt)),
            status: NotificationOutboxStatus.PENDING,
          },
        });
      } else {
        await transaction.notificationOutbox.update({
          where: { id: outboxId },
          data: {
            lastErrorCode: errorCode,
            lockedAt: null,
            lockOwner: null,
            status: NotificationOutboxStatus.FAILED,
          },
        });
      }
    });
  }

  private async cancel(id: string, code: string): Promise<void> {
    await this.prisma.notificationOutbox.updateMany({
      where: {
        id,
        lockOwner: this.workerId,
        status: NotificationOutboxStatus.PROCESSING,
      },
      data: {
        lastErrorCode: code,
        lockedAt: null,
        lockOwner: null,
        status: NotificationOutboxStatus.CANCELLED,
      },
    });
  }

  private async rescheduleUnexpected(id: string): Promise<void> {
    const outbox = await this.prisma.notificationOutbox.findFirst({
      where: {
        id,
        lockOwner: this.workerId,
        status: NotificationOutboxStatus.PROCESSING,
      },
      select: { attemptCount: true },
    });
    if (outbox === null) return;
    const failed = outbox.attemptCount >= MAX_ATTEMPTS;
    await this.prisma.notificationOutbox.update({
      where: { id },
      data: {
        lastErrorCode: 'OUTBOX_PROCESSING_ERROR',
        lockedAt: null,
        lockOwner: null,
        nextAttemptAt: new Date(Date.now() + retryDelay(outbox.attemptCount)),
        status: failed ? NotificationOutboxStatus.FAILED : NotificationOutboxStatus.PENDING,
      },
    });
  }
}

function retryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[attempt] ?? LAST_RETRY_DELAY_MS;
}
