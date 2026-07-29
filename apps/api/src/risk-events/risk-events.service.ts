import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { evaluateRisk, type RiskEngineInput } from '@dont-worry/risk-engine';
import type { DevicePrincipal } from '../auth/authenticated-request';
import { PrismaService } from '../database/prisma.service';
import { ExplanationService } from '../explanations/explanation.service';
import {
  AnalysisStatus,
  ConsentStatus,
  ConsentType,
  IncidentStage,
  Prisma,
  RiskEventType,
  RiskLevel,
} from '../generated/prisma/client';
import { IncidentCreationService } from '../incidents/incident-creation.service';
import { TokenService } from '../security/token.service';
import type {
  CreateRiskEventRequestDto,
  PostCallSurveyRequestDto,
  PostCallSurveyResponseDto,
  RiskEventResponseDto,
} from './risk-events.dto';
import { mergeRiskFeatures } from './text-feature-extractor';
import { UrlAnalysisService, validateCanonicalUrls } from './url-analysis.service';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
const riskEventInclude = {
  signals: {
    orderBy: [{ score: 'desc' as const }, { type: 'asc' as const }],
  },
  urls: true,
} satisfies Prisma.RiskEventInclude;

type StoredRiskEvent = Prisma.RiskEventGetPayload<{
  include: typeof riskEventInclude;
}>;

@Injectable()
export class RiskEventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(UrlAnalysisService) private readonly urlAnalysis: UrlAnalysisService,
    @Inject(IncidentCreationService)
    private readonly incidentCreation: IncidentCreationService,
    @Inject(ExplanationService)
    private readonly explanations: ExplanationService,
  ) {}

  async create(
    device: DevicePrincipal,
    idempotencyKey: string,
    request: CreateRiskEventRequestDto,
  ): Promise<RiskEventResponseDto> {
    assertIdempotencyKey(idempotencyKey);
    assertEventShape(request);
    await this.assertRawAnalysisConsent(device, request.rawText);

    const canonicalUrls = validateCanonicalUrls(request.urls);
    const requestDigest = this.digestRequest(request, canonicalUrls);
    const scope = `RISK_EVENT:${device.id}`;
    const keyDigest = this.tokens.digestIdempotencyKey(scope, idempotencyKey);
    const replay = await this.findIdempotentResponse(device, scope, keyDigest, requestDigest);
    if (replay !== null) {
      return replay;
    }

    const duplicate = await this.prisma.riskEvent.findUnique({
      where: {
        deviceId_clientEventId: {
          clientEventId: request.eventId,
          deviceId: device.id,
        },
      },
      include: riskEventInclude,
    });
    if (duplicate !== null) {
      if (duplicate.requestDigest !== requestDigest) {
        throw new ConflictException({
          code: 'EVENT_ID_REUSED',
          message: 'eventId was already used with a different request',
        });
      }
      await this.rememberIdempotentResult(device, duplicate.id, scope, keyDigest, requestDigest);
      return toResponse(duplicate);
    }

    const urlResult = await this.urlAnalysis.analyze(canonicalUrls);
    const { engineFeatures, featureSnapshot } = mergeRiskFeatures(
      request.features,
      request.rawText,
    );
    const input: RiskEngineInput = {
      eventId: request.eventId,
      eventType: request.type,
      features: engineFeatures,
      ...(request.localDecision === undefined
        ? {}
        : { localMinimumLevel: request.localDecision.level }),
      policyVersion: request.policyVersion,
      reputationComplete: urlResult.reputationComplete,
      schemaVersion: request.schemaVersion,
      urlReputations: urlResult.urls.map((url) => url.reputation),
    };
    const decision = evaluateRisk(input);
    const explanation = await this.explanations.explain(decision, IncidentStage.S0, device.id);
    const analysisStatus =
      decision.completeness === 'FINAL'
        ? AnalysisStatus.FINALIZED
        : AnalysisStatus.FINALIZED_PARTIAL;

    try {
      const stored = await this.prisma.$transaction(
        async (transaction) => {
          const event = await transaction.riskEvent.create({
            data: {
              analysisCompleteness: decision.completeness,
              analysisStatus,
              category: decision.category,
              clientEventId: request.eventId,
              confidence: decision.confidence,
              deviceId: device.id,
              featureSnapshot,
              explanationBody: explanation.body,
              explanationSource: explanation.source,
              explanationTitle: explanation.title,
              normalizedLength: engineFeatures.normalizedLength,
              occurredAt: new Date(request.occurredAt),
              policyVersion: decision.policyVersion,
              recommendedActionIds: decision.recommendedActionIds,
              requestDigest,
              riskLevel: decision.level,
              riskScore: decision.score,
              schemaVersion: request.schemaVersion,
              senderHash:
                request.sender === undefined
                  ? null
                  : this.tokens.digestPhoneNumber(request.sender.normalized),
              senderMasked: request.sender?.masked ?? null,
              signals: {
                create: decision.signals.map((signal) => ({
                  evidence: signal.evidence,
                  group: signal.group,
                  score: signal.score,
                  source: signal.source,
                  type: signal.type,
                })),
              },
              subjectId: device.subjectId,
              type: request.type,
              urls: {
                create: urlResult.urls.map((url) => ({
                  normalizedDomain: url.normalizedDomain,
                  normalizedUrlHash: url.normalizedUrlHash,
                  reputation: url.reputation,
                })),
              },
            },
            include: riskEventInclude,
          });
          await this.incidentCreation.createForDecision(
            transaction,
            {
              id: event.id,
              policyVersion: event.policyVersion,
              subjectId: event.subjectId,
            },
            decision,
            IncidentStage.S0,
            {
              source: explanation.source,
              summary: explanation.incidentSummary,
            },
          );
          await transaction.idempotencyRecord.create({
            data: {
              expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
              keyDigest,
              requestDigest,
              resourceId: event.id,
              responseStatus: 201,
              scope,
            },
          });
          return event;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
      return toResponse(stored);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const racedReplay = await this.findIdempotentResponse(
          device,
          scope,
          keyDigest,
          requestDigest,
        );
        if (racedReplay !== null) {
          return racedReplay;
        }
        const racedEvent = await this.findByClientEventId(device, request.eventId);
        if (racedEvent !== null && racedEvent.requestDigest === requestDigest) {
          return toResponse(racedEvent);
        }
        throw new ConflictException({
          code: 'RISK_EVENT_CONFLICT',
          message: 'The risk event already exists with different input',
        });
      }
      throw error;
    }
  }

  async findOne(device: DevicePrincipal, id: string): Promise<RiskEventResponseDto> {
    const event = await this.prisma.riskEvent.findFirst({
      where: {
        deviceId: device.id,
        id,
      },
      include: riskEventInclude,
    });
    if (event === null) {
      throw new NotFoundException({
        code: 'RISK_EVENT_NOT_FOUND',
        message: 'Risk event was not found',
      });
    }
    return toResponse(event);
  }

  async submitPostCallSurvey(
    device: DevicePrincipal,
    id: string,
    idempotencyKey: string,
    request: PostCallSurveyRequestDto,
  ): Promise<PostCallSurveyResponseDto> {
    assertIdempotencyKey(idempotencyKey);
    const event = await this.prisma.riskEvent.findFirst({
      where: {
        deviceId: device.id,
        id,
      },
      include: {
        incident: true,
        signals: true,
        urls: true,
      },
    });
    if (event === null) {
      throw riskEventNotFound();
    }
    if (event.type !== RiskEventType.CALL) {
      throw new UnprocessableEntityException({
        code: 'POST_CALL_SURVEY_REQUIRES_CALL_EVENT',
        message: 'A post-call survey can only update a CALL event',
      });
    }

    const scope = `SURVEY:${device.id}`;
    const keyDigest = this.tokens.digestIdempotencyKey(scope, idempotencyKey);
    const requestDigest = this.tokens.digestRequest(JSON.stringify(request));
    const replay = await this.findSurveyReplay(device, id, scope, keyDigest, requestDigest);
    if (replay !== null) return replay;

    const featureSnapshot = asFeatureSnapshot(event.featureSnapshot);
    const engineFeatures = mergeSurveyFeatures(featureSnapshot, request);
    const decision = evaluateRisk({
      eventId: event.clientEventId,
      eventType: event.type,
      features: engineFeatures,
      ...(event.riskLevel === RiskLevel.UNKNOWN ? {} : { localMinimumLevel: event.riskLevel }),
      policyVersion: event.policyVersion,
      reputationComplete:
        event.urls.length === 0 || event.urls.every((url) => url.reputation !== 'UNAVAILABLE'),
      schemaVersion: event.schemaVersion,
      urlReputations: event.urls.map((url) => url.reputation),
    });
    const stage = stageForSurvey(request);
    const explanation = await this.explanations.explain(decision, stage, device.id);
    const analysisStatus =
      decision.completeness === 'FINAL'
        ? AnalysisStatus.FINALIZED
        : AnalysisStatus.FINALIZED_PARTIAL;

    try {
      await this.prisma.$transaction(
        async (transaction) => {
          await transaction.riskSignal.deleteMany({ where: { eventId: id } });
          await transaction.riskEvent.update({
            where: { id },
            data: {
              analysisCompleteness: decision.completeness,
              analysisStatus,
              category: decision.category,
              confidence: decision.confidence,
              explanationBody: explanation.body,
              explanationSource: explanation.source,
              explanationTitle: explanation.title,
              featureSnapshot: {
                ...featureSnapshot,
                ...engineFeatures,
                postCallSurvey: {
                  ...request,
                  submitted: true,
                },
              },
              recommendedActionIds: decision.recommendedActionIds,
              riskLevel: decision.level,
              riskScore: decision.score,
              signals: {
                create: decision.signals.map((signal) => ({
                  evidence: signal.evidence,
                  group: signal.group,
                  score: signal.score,
                  source: signal.source,
                  type: signal.type,
                })),
              },
            },
          });
          await this.incidentCreation.createForDecision(
            transaction,
            {
              id,
              policyVersion: event.policyVersion,
              subjectId: event.subjectId,
            },
            decision,
            stage,
            {
              source: explanation.source,
              summary: explanation.incidentSummary,
            },
          );
          await transaction.idempotencyRecord.create({
            data: {
              expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
              keyDigest,
              requestDigest,
              resourceId: id,
              responseStatus: 201,
              scope,
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const racedReplay = await this.findSurveyReplay(
          device,
          id,
          scope,
          keyDigest,
          requestDigest,
        );
        if (racedReplay !== null) return racedReplay;
      }
      throw error;
    }
    return this.postCallSurveyResponse(device, id);
  }

  private async assertRawAnalysisConsent(
    device: DevicePrincipal,
    rawText: string | undefined,
  ): Promise<void> {
    if (rawText === undefined) {
      return;
    }
    const consent = await this.prisma.consent.findFirst({
      where: {
        deviceId: device.id,
        subjectId: device.subjectId,
        type: ConsentType.RAW_SERVER_ANALYSIS,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: { status: true },
    });
    if (consent?.status !== ConsentStatus.GRANTED) {
      throw new ForbiddenException({
        code: 'RAW_SERVER_ANALYSIS_CONSENT_REQUIRED',
        message: 'Raw text analysis requires active explicit consent',
      });
    }
  }

  private async findIdempotentResponse(
    device: DevicePrincipal,
    scope: string,
    keyDigest: string,
    requestDigest: string,
  ): Promise<RiskEventResponseDto | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        scope_keyDigest: {
          keyDigest,
          scope,
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
    const event = await this.prisma.riskEvent.findFirst({
      where: {
        deviceId: device.id,
        id: record.resourceId,
      },
      include: riskEventInclude,
    });
    if (event === null) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_RESOURCE_MISSING',
        message: 'The idempotent risk event result is unavailable',
      });
    }
    return toResponse(event);
  }

  private async findSurveyReplay(
    device: DevicePrincipal,
    eventId: string,
    scope: string,
    keyDigest: string,
    requestDigest: string,
  ): Promise<PostCallSurveyResponseDto | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        scope_keyDigest: {
          keyDigest,
          scope,
        },
      },
    });
    if (record === null) return null;
    if (record.requestDigest !== requestDigest || record.resourceId !== eventId) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency-Key was already used with a different request',
      });
    }
    return this.postCallSurveyResponse(device, eventId);
  }

  private async postCallSurveyResponse(
    device: DevicePrincipal,
    eventId: string,
  ): Promise<PostCallSurveyResponseDto> {
    const [event, incident] = await Promise.all([
      this.findOne(device, eventId),
      this.prisma.incident.findUnique({
        where: { riskEventId: eventId },
        select: { stage: true },
      }),
    ]);
    return {
      ...event,
      incidentStage: incident?.stage ?? null,
    };
  }

  private async rememberIdempotentResult(
    device: DevicePrincipal,
    resourceId: string,
    scope: string,
    keyDigest: string,
    requestDigest: string,
  ): Promise<void> {
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
          keyDigest,
          requestDigest,
          resourceId,
          responseStatus: 201,
          scope,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const replay = await this.findIdempotentResponse(device, scope, keyDigest, requestDigest);
      if (replay === null) {
        throw error;
      }
    }
  }

  private findByClientEventId(
    device: DevicePrincipal,
    clientEventId: string,
  ): Promise<StoredRiskEvent | null> {
    return this.prisma.riskEvent.findUnique({
      where: {
        deviceId_clientEventId: {
          clientEventId,
          deviceId: device.id,
        },
      },
      include: riskEventInclude,
    });
  }

  private digestRequest(
    request: CreateRiskEventRequestDto,
    urls: ReturnType<typeof validateCanonicalUrls>,
  ): string {
    return this.tokens.digestRequest(
      JSON.stringify({
        eventId: request.eventId,
        features: {
          contentAvailable: request.features.contentAvailable,
          contentTruncated: request.features.contentTruncated,
          extractionComplete: request.features.extractionComplete,
          impersonatedEntityTypes: [...request.features.impersonatedEntityTypes].sort(),
          normalizedLength: request.features.normalizedLength,
          requestsAppInstall: request.features.requestsAppInstall,
          requestsPayment: request.features.requestsPayment,
          requestsRemoteControl: request.features.requestsRemoteControl,
          requestsSecret: request.features.requestsSecret,
          riskKeywordIds: [...request.features.riskKeywordIds].sort(),
        },
        localDecisionLevel: request.localDecision?.level ?? null,
        occurredAt: new Date(request.occurredAt).toISOString(),
        policyVersion: request.policyVersion,
        rawTextDigest:
          request.rawText === undefined ? null : this.tokens.digestRequest(request.rawText),
        schemaVersion: request.schemaVersion,
        sender:
          request.sender === undefined
            ? null
            : {
                masked: request.sender.masked,
                normalizedHash: this.tokens.digestPhoneNumber(request.sender.normalized),
              },
        type: request.type,
        urls: [...urls].sort((left, right) =>
          left.normalizedUrlHash.localeCompare(right.normalizedUrlHash),
        ),
      }),
    );
  }
}

function toResponse(event: StoredRiskEvent): RiskEventResponseDto {
  return {
    category: event.category,
    completeness: event.analysisCompleteness,
    confidence: event.confidence,
    createdAt: event.createdAt.toISOString(),
    eventId: event.clientEventId,
    explanationBody:
      event.explanationBody ?? '분석은 완료되었습니다. 확인된 근거를 그대로 안내합니다.',
    explanationSource: event.explanationSource,
    explanationTitle: event.explanationTitle ?? '분석 결과를 확인해 주세요',
    id: event.id,
    level: event.riskLevel,
    occurredAt: event.occurredAt.toISOString(),
    policyVersion: event.policyVersion,
    recommendedActionIds: event.recommendedActionIds,
    score: event.riskScore,
    signals: event.signals.map((signal) => ({
      evidence: signal.evidence,
      group: signal.group,
      score: signal.score,
      source: signal.source,
      type: signal.type as RiskEventResponseDto['signals'][number]['type'],
    })),
  };
}

function assertEventShape(request: CreateRiskEventRequestDto): void {
  if (request.type === 'URL' && request.urls.length === 0) {
    throw new UnprocessableEntityException({
      code: 'URL_EVENT_REQUIRES_URL',
      message: 'A URL event must contain at least one URL',
    });
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

function asFeatureSnapshot(value: Prisma.JsonValue): Record<string, Prisma.InputJsonValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, Prisma.InputJsonValue>;
}

function mergeSurveyFeatures(
  snapshot: Record<string, Prisma.InputJsonValue>,
  survey: PostCallSurveyRequestDto,
): RiskEngineInput['features'] {
  return {
    contentAvailable: booleanFeature(snapshot, 'contentAvailable'),
    contentTruncated: booleanFeature(snapshot, 'contentTruncated'),
    extractionComplete: booleanFeature(snapshot, 'extractionComplete'),
    hasImpersonationOrPressure: booleanFeature(snapshot, 'hasImpersonationOrPressure'),
    hasSecrecyPressure: booleanFeature(snapshot, 'hasSecrecyPressure') || survey.requestedSecret,
    impersonatedEntityTypes: impersonatedEntities(snapshot.impersonatedEntityTypes),
    normalizedLength: numberFeature(snapshot, 'normalizedLength'),
    officialSourceVerified: booleanFeature(snapshot, 'officialSourceVerified'),
    phoneReported: booleanFeature(snapshot, 'phoneReported'),
    recentSuspiciousEvent: booleanFeature(snapshot, 'recentSuspiciousEvent'),
    requestsAppInstall:
      booleanFeature(snapshot, 'requestsAppInstall') || survey.requestedAppInstall,
    requestsPayment: booleanFeature(snapshot, 'requestsPayment') || survey.requestedPayment,
    requestsRemoteControl:
      booleanFeature(snapshot, 'requestsRemoteControl') || survey.requestedRemoteControl,
    requestsSecret: booleanFeature(snapshot, 'requestsSecret') || survey.requestedSecret,
    userClickedLink: booleanFeature(snapshot, 'userClickedLink') || survey.clickedLink,
    userConfirmedTransfer:
      booleanFeature(snapshot, 'userConfirmedTransfer') || survey.transferredMoney,
    userEnteredPersonalInformation:
      booleanFeature(snapshot, 'userEnteredPersonalInformation') ||
      survey.enteredPersonalInformation,
    userInstalledApp: booleanFeature(snapshot, 'userInstalledApp') || survey.installedApp,
  };
}

function booleanFeature(snapshot: Record<string, Prisma.InputJsonValue>, key: string): boolean {
  return snapshot[key] === true;
}

function numberFeature(snapshot: Record<string, Prisma.InputJsonValue>, key: string): number {
  const value = snapshot[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function impersonatedEntities(
  value: Prisma.InputJsonValue | undefined,
): RiskEngineInput['features']['impersonatedEntityTypes'] {
  const allowed = new Set([
    'DELIVERY',
    'FAMILY',
    'FINANCIAL_INSTITUTION',
    'LAW_ENFORCEMENT',
    'PUBLIC_AGENCY',
  ]);
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is RiskEngineInput['features']['impersonatedEntityTypes'][number] =>
      typeof item === 'string' && allowed.has(item),
  );
}

function stageForSurvey(survey: PostCallSurveyRequestDto): IncidentStage {
  if (survey.transferredMoney) return IncidentStage.S4;
  if (survey.installedApp) return IncidentStage.S3;
  if (survey.enteredPersonalInformation) return IncidentStage.S2;
  if (survey.clickedLink) return IncidentStage.S1;
  return IncidentStage.S0;
}

function riskEventNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'RISK_EVENT_NOT_FOUND',
    message: 'Risk event was not found',
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
