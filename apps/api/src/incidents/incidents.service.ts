import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { GuardianPrincipal } from '../auth/authenticated-request';
import { PrismaService } from '../database/prisma.service';
import {
  ActionItemStatus,
  CareConnectionStatus,
  IncidentStatus,
  ShareLevel,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import type {
  IncidentResponseDto,
  UpdateActionItemRequestDto,
  UpdateIncidentStageRequestDto,
  UpdateIncidentStatusRequestDto,
} from './incidents.dto';
import { actionsForStage } from './incident-creation.service';

const STATUS_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  ACKNOWLEDGED: [IncidentStatus.IN_PROGRESS, IncidentStatus.ESCALATED, IncidentStatus.RESOLVED],
  ESCALATED: [IncidentStatus.IN_PROGRESS, IncidentStatus.RESOLVED],
  IN_PROGRESS: [IncidentStatus.ESCALATED, IncidentStatus.RESOLVED],
  OPEN: [IncidentStatus.ACKNOWLEDGED, IncidentStatus.ESCALATED],
  RESOLVED: [],
};

function guardianIncidentInclude(guardianId: string) {
  return {
    actionItems: {
      orderBy: { sortOrder: 'asc' as const },
    },
    notificationOutbox: {
      orderBy: { createdAt: 'desc' as const },
      take: 1,
      where: { guardianId },
    },
    riskEvent: {
      include: {
        signals: {
          orderBy: [{ score: 'desc' as const }, { type: 'asc' as const }],
        },
      },
    },
    subject: {
      include: {
        careConnections: {
          take: 1,
          where: {
            guardianId,
            status: CareConnectionStatus.ACTIVE,
          },
        },
      },
    },
  } satisfies Prisma.IncidentInclude;
}

type GuardianIncident = Prisma.IncidentGetPayload<{
  include: ReturnType<typeof guardianIncidentInclude>;
}>;

@Injectable()
export class IncidentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(guardian: GuardianPrincipal): Promise<IncidentResponseDto[]> {
    const incidents = await this.prisma.incident.findMany({
      where: {
        subject: {
          careConnections: {
            some: {
              guardianId: guardian.id,
              status: CareConnectionStatus.ACTIVE,
            },
          },
        },
      },
      include: guardianIncidentInclude(guardian.id),
      orderBy: {
        updatedAt: 'desc',
      },
      take: 100,
    });
    return incidents.sort(compareIncidentPriority).map(toResponse);
  }

  async findOne(guardian: GuardianPrincipal, id: string): Promise<IncidentResponseDto> {
    return toResponse(await this.findAuthorized(guardian.id, id));
  }

  async updateStatus(
    guardian: GuardianPrincipal,
    id: string,
    request: UpdateIncidentStatusRequestDto,
  ): Promise<IncidentResponseDto> {
    const incident = await this.findAuthorized(guardian.id, id);
    if (!STATUS_TRANSITIONS[incident.status].includes(request.status)) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Incident cannot transition from ${incident.status} to ${request.status}`,
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.incident.updateMany({
        where: {
          id,
          status: incident.status,
          version: request.version,
        },
        data: {
          acknowledgedAt:
            request.status === IncidentStatus.ACKNOWLEDGED ||
            request.status === IncidentStatus.IN_PROGRESS ||
            request.status === IncidentStatus.RESOLVED
              ? (incident.acknowledgedAt ?? now)
              : incident.acknowledgedAt,
          resolvedAt: request.status === IncidentStatus.RESOLVED ? now : null,
          status: request.status,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          code: 'STALE_INCIDENT_VERSION',
          message: 'Incident was updated by another request',
        });
      }
      await transaction.incidentHistory.create({
        data: {
          actorGuardianId: guardian.id,
          fromStatus: incident.status,
          incidentId: id,
          toStatus: request.status,
        },
      });
    });
    return this.findOne(guardian, id);
  }

  async updateStage(
    guardian: GuardianPrincipal,
    id: string,
    request: UpdateIncidentStageRequestDto,
  ): Promise<IncidentResponseDto> {
    const incident = await this.findAuthorized(guardian.id, id);
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new ConflictException({
        code: 'RESOLVED_INCIDENT_STAGE_LOCKED',
        message: 'A resolved incident stage cannot be changed',
      });
    }
    if (incident.stage === request.stage) {
      if (incident.version !== request.version) {
        throw staleIncident();
      }
      return toResponse(incident);
    }

    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.incident.updateMany({
        where: {
          id,
          stage: incident.stage,
          version: request.version,
        },
        data: {
          stage: request.stage,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw staleIncident();
      }
      await transaction.incidentHistory.create({
        data: {
          actorGuardianId: guardian.id,
          fromStage: incident.stage,
          incidentId: id,
          toStage: request.stage,
        },
      });
      await transaction.actionItem.createMany({
        data: actionsForStage(request.stage).map((action) => ({
          ...action,
          incidentId: id,
          stage: request.stage,
        })),
        skipDuplicates: true,
      });
    });
    return this.findOne(guardian, id);
  }

  async updateActionItem(
    guardian: GuardianPrincipal,
    id: string,
    request: UpdateActionItemRequestDto,
  ): Promise<IncidentResponseDto> {
    const item = await this.prisma.actionItem.findFirst({
      where: {
        id,
        incident: {
          subject: {
            careConnections: {
              some: {
                guardianId: guardian.id,
                status: CareConnectionStatus.ACTIVE,
              },
            },
          },
        },
      },
      select: {
        incidentId: true,
        stage: true,
        incident: {
          select: {
            stage: true,
          },
        },
      },
    });
    if (item === null || item.stage !== item.incident.stage) {
      throw incidentNotFound();
    }
    const now = new Date();
    await this.prisma.actionItem.update({
      where: { id },
      data: {
        assignedGuardianId: request.completed ? guardian.id : null,
        completedAt: request.completed ? now : null,
        status: request.completed ? ActionItemStatus.COMPLETED : ActionItemStatus.PENDING,
      },
    });
    return this.findOne(guardian, item.incidentId);
  }

  private async findAuthorized(guardianId: string, id: string): Promise<GuardianIncident> {
    const incident = await this.prisma.incident.findFirst({
      where: {
        id,
        subject: {
          careConnections: {
            some: {
              guardianId,
              status: CareConnectionStatus.ACTIVE,
            },
          },
        },
      },
      include: guardianIncidentInclude(guardianId),
    });
    if (incident === null) {
      throw incidentNotFound();
    }
    return incident;
  }
}

function toResponse(incident: GuardianIncident): IncidentResponseDto {
  const connection = incident.subject.careConnections[0];
  if (connection === undefined) {
    throw incidentNotFound();
  }
  const basicSharing = connection.shareLevel === ShareLevel.BASIC;
  return {
    actionItems: basicSharing
      ? incident.actionItems
          .filter((item) => item.stage === incident.stage)
          .map((item) => ({
            actionId: item.actionId,
            completedAt: item.completedAt?.toISOString() ?? null,
            id: item.id,
            sortOrder: item.sortOrder,
            status: item.status,
            title: item.title,
          }))
      : [],
    eventType: incident.riskEvent.type,
    id: incident.id,
    notificationStatus: incident.notificationOutbox[0]?.status ?? null,
    occurredAt: incident.riskEvent.occurredAt.toISOString(),
    riskLevel: incident.riskEvent.riskLevel,
    senderMasked: basicSharing ? incident.riskEvent.senderMasked : null,
    shareLevel: connection.shareLevel,
    signalTypes: basicSharing ? incident.riskEvent.signals.map((signal) => signal.type) : [],
    stage: basicSharing ? incident.stage : null,
    status: incident.status,
    subjectDisplayName: incident.subject.displayName,
    subjectId: incident.subjectId,
    summary: basicSharing ? incident.summary : null,
    summarySource: basicSharing ? incident.summarySource : null,
    updatedAt: incident.updatedAt.toISOString(),
    version: incident.version,
  };
}

function compareIncidentPriority(left: GuardianIncident, right: GuardianIncident): number {
  const statusDifference =
    (left.status === IncidentStatus.RESOLVED ? 1 : 0) -
    (right.status === IncidentStatus.RESOLVED ? 1 : 0);
  if (statusDifference !== 0) return statusDifference;

  const levelRank = {
    CRITICAL: 4,
    HIGH: 3,
    CAUTION: 2,
    UNKNOWN: 1,
    SAFE: 0,
  } as const;
  const levelDifference =
    levelRank[right.riskEvent.riskLevel] - levelRank[left.riskEvent.riskLevel];
  if (levelDifference !== 0) return levelDifference;

  const riskyTypes = new Set([
    'APP_INSTALL_REQUEST',
    'PAYMENT_REQUEST',
    'REMOTE_CONTROL_REQUEST',
    'SECRET_REQUEST',
    'USER_CONFIRMED_TRANSFER',
  ]);
  const leftHasAction = left.riskEvent.signals.some((signal) => riskyTypes.has(signal.type));
  const rightHasAction = right.riskEvent.signals.some((signal) => riskyTypes.has(signal.type));
  if (leftHasAction !== rightHasAction) return rightHasAction ? 1 : -1;

  return left.riskEvent.occurredAt.getTime() - right.riskEvent.occurredAt.getTime();
}

function incidentNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'INCIDENT_NOT_FOUND',
    message: 'Incident was not found',
  });
}

function staleIncident(): ConflictException {
  return new ConflictException({
    code: 'STALE_INCIDENT_VERSION',
    message: 'Incident was updated by another request',
  });
}
