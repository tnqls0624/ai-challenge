import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { GUARDIAN_IDENTITY_VERIFIER } from '../src/auth/guardian-identity';
import type { GuardianIdentityVerifier } from '../src/auth/guardian-identity';
import { configureApplication } from '../src/bootstrap/configure-application';
import { PrismaService } from '../src/database/prisma.service';
import { OutboxWorker } from '../src/notifications/outbox.worker';
import {
  PUSH_PROVIDER,
  PushDeliveryError,
  type PushNotification,
  type PushProvider,
} from '../src/notifications/push.provider';
import { canonicalizeUrl } from '../src/risk-events/url-analysis.service';
import {
  URL_REPUTATION_PROVIDER,
  type UrlReputationProvider,
} from '../src/risk-events/url-reputation.provider';

const guardianToken = 'integration-test-guardian-token';
const deviceInstallationId = 'integration-device-installation-01';
const idempotencyKey = 'integration-activation-0001';

const guardianIdentityVerifier: GuardianIdentityVerifier = {
  verifyIdToken: async (token) => {
    if (token !== guardianToken) {
      throw new Error('Unexpected integration-test guardian token');
    }
    return {
      email: 'guardian@example.com',
      firebaseUid: 'firebase-integration-guardian',
    };
  },
};

const urlReputationProvider: UrlReputationProvider = {
  check: async (urls) =>
    urls.map((url) => ({
      normalizedUrlHash: url.normalizedUrlHash,
      verdict: url.normalizedDomain === 'card-delivery.invalid' ? 'MALICIOUS' : 'CLEAR',
    })),
};

const deliveredPushes: Array<{
  notification: PushNotification;
  token: string;
}> = [];
let pushFailure: PushDeliveryError | null = null;
const pushProvider: PushProvider = {
  send: async (token, notification) => {
    if (pushFailure !== null) {
      throw pushFailure;
    }
    deliveredPushes.push({ notification, token });
    return { providerMessageId: `test-message-${deliveredPushes.length}` };
  },
};

describe('guardian-to-device activation flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GUARDIAN_IDENTITY_VERIFIER)
      .useValue(guardianIdentityVerifier)
      .overrideProvider(URL_REPUTATION_PROVIDER)
      .useValue(urlReputationProvider)
      .overrideProvider(PUSH_PROVIDER)
      .useValue(pushProvider)
      .compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    deliveredPushes.length = 0;
    pushFailure = null;
    await prisma.idempotencyRecord.deleteMany();
    await prisma.notificationDelivery.deleteMany();
    await prisma.notificationOutbox.deleteMany();
    await prisma.actionItem.deleteMany();
    await prisma.incidentHistory.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.guardianPushSubscription.deleteMany();
    await prisma.consent.deleteMany();
    await prisma.activationSession.deleteMany();
    await prisma.riskSignal.deleteMany();
    await prisma.riskEventUrl.deleteMany();
    await prisma.riskEvent.deleteMany();
    await prisma.device.deleteMany();
    await prisma.activationCode.deleteMany();
    await prisma.careConnection.deleteMany();
    await prisma.subjectProfile.deleteMany();
    await prisma.guardianAccount.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, previews, consents to, and idempotently activates a care connection', async () => {
    const guardianResponse = await request(app.getHttpServer())
      .post('/v1/auth/guardian/session')
      .set('Authorization', `Bearer ${guardianToken}`)
      .send({ displayName: '김보호' })
      .expect(201);

    expect(guardianResponse.body).toMatchObject({
      displayName: '김보호',
      email: 'guardian@example.com',
    });

    const subjectResponse = await request(app.getHttpServer())
      .post('/v1/subjects')
      .set('Authorization', `Bearer ${guardianToken}`)
      .send({ displayName: '어머니', role: 'CHILD' })
      .expect(201);

    const subjectId = subjectResponse.body.id as string;
    const activationCodeResponse = await request(app.getHttpServer())
      .post(`/v1/subjects/${subjectId}/activation-codes`)
      .set('Authorization', `Bearer ${guardianToken}`)
      .expect(201);

    const activationCode = activationCodeResponse.body.code as string;
    expect(activationCode).toMatch(/^\d{6}$/);

    const previewResponse = await request(app.getHttpServer())
      .post('/v1/devices/activation-previews')
      .send({
        code: activationCode,
        deviceInstallationId,
      })
      .expect(201);

    expect(previewResponse.body).toMatchObject({
      consentTextVersions: {
        autoGuardianAlert: 'auto-guardian-alert-v1',
        careConnection: 'care-connection-v1',
      },
      guardianDisplayName: '김보호',
      relationshipRole: 'CHILD',
      subjectDisplayName: '어머니',
    });

    const activationSessionId = previewResponse.body.activationSessionId as string;
    const activationRequest = {
      activationSessionId,
      autoGuardianAlertConsent: {
        consentTextVersion: 'auto-guardian-alert-v1',
        granted: true,
        threshold: 'CRITICAL',
      },
      careConnectionConsent: {
        consentTextVersion: 'care-connection-v1',
        granted: true,
      },
      deviceInstallationId,
      devicePublicKey: `-----BEGIN PUBLIC KEY-----${'A'.repeat(64)}-----END PUBLIC KEY-----`,
      shareLevel: 'BASIC',
    };

    await request(app.getHttpServer())
      .post('/v1/devices/activate')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        ...activationRequest,
        deviceInstallationId: 'different-device-installation',
      })
      .expect(422);

    const activationResponse = await request(app.getHttpServer())
      .post('/v1/devices/activate')
      .set('Idempotency-Key', idempotencyKey)
      .send(activationRequest)
      .expect(201);

    expect(activationResponse.body).toMatchObject({
      autoGuardianAlertThreshold: 'CRITICAL',
      shareLevel: 'BASIC',
      subjectId,
    });

    const replayResponse = await request(app.getHttpServer())
      .post('/v1/devices/activate')
      .set('Idempotency-Key', idempotencyKey)
      .send(activationRequest)
      .expect(201);

    expect(replayResponse.body).toEqual(activationResponse.body);

    const conflictingReplay = await request(app.getHttpServer())
      .post('/v1/devices/activate')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        ...activationRequest,
        shareLevel: 'MINIMAL',
      })
      .expect(409);
    expect(conflictingReplay.body).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });

    const [connection, storedCode, storedDevice, consentCount] = await Promise.all([
      prisma.careConnection.findUniqueOrThrow({
        where: {
          guardianId_subjectId: {
            guardianId: guardianResponse.body.id as string,
            subjectId,
          },
        },
      }),
      prisma.activationCode.findFirstOrThrow({ where: { subjectId } }),
      prisma.device.findFirstOrThrow({ where: { subjectId } }),
      prisma.consent.count({ where: { subjectId } }),
    ]);

    expect(connection.status).toBe('ACTIVE');
    expect(storedCode.status).toBe('CONSUMED');
    expect(storedCode.codeDigest).not.toBe(activationCode);
    expect(storedDevice.credentialDigest).not.toBe(activationResponse.body.deviceCredential);
    expect(consentCount).toBe(2);

    const pushToken = 'integration-fcm-registration-token-0001';
    await request(app.getHttpServer())
      .post('/v1/guardian-push-subscriptions')
      .set('Authorization', `Bearer ${guardianToken}`)
      .send({ token: pushToken })
      .expect(201);

    const canonicalUrl = canonicalizeUrl('https://card-delivery.invalid/payment?case=fixture');
    const riskEventRequest = {
      eventId: '00000000-0000-4000-8000-000000000001',
      features: {
        contentAvailable: true,
        contentTruncated: false,
        extractionComplete: true,
        impersonatedEntityTypes: ['PUBLIC_AGENCY'],
        normalizedLength: 52,
        requestsAppInstall: false,
        requestsPayment: true,
        requestsRemoteControl: false,
        requestsSecret: false,
        riskKeywordIds: ['PAYMENT_REQUEST', 'URGENCY'],
      },
      occurredAt: '2026-07-28T12:00:00.000Z',
      policyVersion: '2026-07-28.1',
      schemaVersion: 1,
      type: 'MANUAL',
      urls: [canonicalUrl],
    };
    const riskIdempotencyKey = 'integration-risk-event-0001';
    const riskResponse = await request(app.getHttpServer())
      .post('/v1/risk-events')
      .set('Authorization', `Bearer ${activationResponse.body.deviceCredential as string}`)
      .set('Idempotency-Key', riskIdempotencyKey)
      .send(riskEventRequest)
      .expect(201);

    expect(riskResponse.body).toMatchObject({
      category: 'GOVERNMENT_IMPERSONATION',
      completeness: 'FINAL',
      confidence: 'HIGH',
      eventId: riskEventRequest.eventId,
      level: 'CRITICAL',
      policyVersion: '2026-07-28.1',
      score: 75,
    });
    expect(riskResponse.body.signals).toHaveLength(3);

    const incidentBeforeDelivery = await prisma.incident.findUniqueOrThrow({
      where: { riskEventId: riskResponse.body.id as string },
      include: {
        actionItems: true,
        notificationOutbox: true,
      },
    });
    expect(incidentBeforeDelivery).toMatchObject({
      stage: 'S0',
      status: 'OPEN',
    });
    expect(incidentBeforeDelivery.actionItems).toHaveLength(3);
    expect(incidentBeforeDelivery.notificationOutbox).toEqual([
      expect.objectContaining({ status: 'PENDING' }),
    ]);

    const outboxWorker = app.get(OutboxWorker);
    await expect(outboxWorker.processBatch()).resolves.toBe(1);
    expect(deliveredPushes).toEqual([
      {
        notification: expect.objectContaining({
          incidentId: incidentBeforeDelivery.id,
          riskLevel: 'CRITICAL',
          subjectDisplayName: '어머니',
        }),
        token: pushToken,
      },
    ]);

    const sentOutbox = await prisma.notificationOutbox.findFirstOrThrow({
      where: { incidentId: incidentBeforeDelivery.id },
      include: { deliveries: true },
    });
    expect(sentOutbox.status).toBe('SENT');
    expect(sentOutbox.deliveries).toEqual([
      expect.objectContaining({
        providerMessageId: 'test-message-1',
        status: 'SENT',
      }),
    ]);

    const dashboardResponse = await request(app.getHttpServer())
      .get('/v1/incidents')
      .set('Authorization', `Bearer ${guardianToken}`)
      .expect(200);
    expect(dashboardResponse.body).toEqual([
      expect.objectContaining({
        actionItems: expect.arrayContaining([
          expect.objectContaining({ actionId: 'STOP_CONTACT' }),
        ]),
        id: incidentBeforeDelivery.id,
        notificationStatus: 'SENT',
        riskLevel: 'CRITICAL',
        signalTypes: expect.arrayContaining(['PAYMENT_REQUEST', 'VERIFIED_MALICIOUS_URL']),
        stage: 'S0',
        status: 'OPEN',
        subjectDisplayName: '어머니',
      }),
    ]);

    const acknowledgedResponse = await request(app.getHttpServer())
      .patch(`/v1/incidents/${incidentBeforeDelivery.id}/status`)
      .set('Authorization', `Bearer ${guardianToken}`)
      .send({ status: 'ACKNOWLEDGED', version: 1 })
      .expect(200);
    expect(acknowledgedResponse.body).toMatchObject({
      status: 'ACKNOWLEDGED',
      version: 2,
    });

    await request(app.getHttpServer())
      .patch(`/v1/incidents/${incidentBeforeDelivery.id}/status`)
      .set('Authorization', `Bearer ${guardianToken}`)
      .send({ status: 'IN_PROGRESS', version: 1 })
      .expect(409);

    const stopContactActionId = incidentBeforeDelivery.actionItems.find(
      (item) => item.actionId === 'STOP_CONTACT',
    )?.id;
    expect(stopContactActionId).toBeDefined();
    const actionResponse = await request(app.getHttpServer())
      .patch(`/v1/action-items/${stopContactActionId as string}`)
      .set('Authorization', `Bearer ${guardianToken}`)
      .send({ completed: true })
      .expect(200);
    expect(actionResponse.body.actionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: stopContactActionId,
          status: 'COMPLETED',
        }),
      ]),
    );

    const stageResponse = await request(app.getHttpServer())
      .patch(`/v1/incidents/${incidentBeforeDelivery.id}/stage`)
      .set('Authorization', `Bearer ${guardianToken}`)
      .send({ stage: 'S4', version: 2 })
      .expect(200);
    expect(stageResponse.body).toMatchObject({
      actionItems: [
        expect.objectContaining({ actionId: 'CALL_112', status: 'PENDING' }),
        expect.objectContaining({ actionId: 'REQUEST_PAYMENT_STOP', status: 'PENDING' }),
        expect.objectContaining({ actionId: 'PRESERVE_EVIDENCE', status: 'PENDING' }),
      ],
      stage: 'S4',
      version: 3,
    });
    await request(app.getHttpServer())
      .patch(`/v1/incidents/${incidentBeforeDelivery.id}/stage`)
      .set('Authorization', `Bearer ${guardianToken}`)
      .send({ stage: 'S3', version: 2 })
      .expect(409);
    const storedStageActions = await prisma.actionItem.findMany({
      where: { incidentId: incidentBeforeDelivery.id },
      orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
    });
    expect(storedStageActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'STOP_CONTACT',
          stage: 'S0',
          status: 'COMPLETED',
        }),
        expect.objectContaining({ actionId: 'CALL_112', stage: 'S4', status: 'PENDING' }),
      ]),
    );

    const callEventRequest = {
      eventId: '00000000-0000-4000-8000-000000000003',
      features: {
        contentAvailable: false,
        contentTruncated: false,
        extractionComplete: false,
        impersonatedEntityTypes: [],
        normalizedLength: 0,
        requestsAppInstall: false,
        requestsPayment: false,
        requestsRemoteControl: false,
        requestsSecret: false,
        riskKeywordIds: [],
      },
      occurredAt: '2026-07-28T12:00:30.000Z',
      policyVersion: '2026-07-28.1',
      schemaVersion: 1,
      type: 'CALL',
      urls: [],
    };
    const callResponse = await request(app.getHttpServer())
      .post('/v1/risk-events')
      .set('Authorization', `Bearer ${activationResponse.body.deviceCredential as string}`)
      .set('Idempotency-Key', 'integration-call-event-0001')
      .send(callEventRequest)
      .expect(201);
    expect(callResponse.body).toMatchObject({
      level: 'UNKNOWN',
    });
    const surveyRequest = {
      clickedLink: false,
      enteredPersonalInformation: false,
      installedApp: true,
      requestedAppInstall: true,
      requestedPayment: false,
      requestedRemoteControl: true,
      requestedSecret: false,
      transferredMoney: false,
    };
    const surveyResponse = await request(app.getHttpServer())
      .post(`/v1/risk-events/${callResponse.body.id as string}/post-call-survey`)
      .set('Authorization', `Bearer ${activationResponse.body.deviceCredential as string}`)
      .set('Idempotency-Key', 'integration-call-survey-0001')
      .send(surveyRequest)
      .expect(201);
    expect(surveyResponse.body).toMatchObject({
      category: 'MALWARE_INSTALLATION',
      incidentStage: 'S3',
      level: 'CRITICAL',
    });
    const surveyIncident = await prisma.incident.findUniqueOrThrow({
      where: { riskEventId: callResponse.body.id as string },
      include: { actionItems: { where: { stage: 'S3' }, orderBy: { sortOrder: 'asc' } } },
    });
    expect(surveyIncident.actionItems[0]).toMatchObject({
      actionId: 'DISCONNECT_NETWORK',
    });
    const surveyReplay = await request(app.getHttpServer())
      .post(`/v1/risk-events/${callResponse.body.id as string}/post-call-survey`)
      .set('Authorization', `Bearer ${activationResponse.body.deviceCredential as string}`)
      .set('Idempotency-Key', 'integration-call-survey-0001')
      .send(surveyRequest)
      .expect(201);
    expect(surveyReplay.body).toEqual(surveyResponse.body);
    await request(app.getHttpServer())
      .post(`/v1/risk-events/${callResponse.body.id as string}/post-call-survey`)
      .set('Authorization', `Bearer ${activationResponse.body.deviceCredential as string}`)
      .set('Idempotency-Key', 'integration-call-survey-0001')
      .send({ ...surveyRequest, transferredMoney: true })
      .expect(409);
    await expect(outboxWorker.processBatch()).resolves.toBe(1);

    await prisma.careConnection.update({
      where: { id: connection.id },
      data: { shareLevel: 'MINIMAL' },
    });
    const minimalSharingResponse = await request(app.getHttpServer())
      .get(`/v1/incidents/${incidentBeforeDelivery.id}`)
      .set('Authorization', `Bearer ${guardianToken}`)
      .expect(200);
    expect(minimalSharingResponse.body).toMatchObject({
      actionItems: [],
      senderMasked: null,
      signalTypes: [],
      stage: null,
    });

    const riskReplayResponse = await request(app.getHttpServer())
      .post('/v1/risk-events')
      .set('Authorization', `Bearer ${activationResponse.body.deviceCredential as string}`)
      .set('Idempotency-Key', riskIdempotencyKey)
      .send(riskEventRequest)
      .expect(201);
    expect(riskReplayResponse.body).toEqual(riskResponse.body);

    const riskGetResponse = await request(app.getHttpServer())
      .get(`/v1/risk-events/${riskResponse.body.id as string}`)
      .set('Authorization', `Bearer ${activationResponse.body.deviceCredential as string}`)
      .expect(200);
    expect(riskGetResponse.body).toEqual(riskResponse.body);

    const storedRiskEvent = await prisma.riskEvent.findUniqueOrThrow({
      where: { id: riskResponse.body.id as string },
      include: { urls: true },
    });
    expect(JSON.stringify(storedRiskEvent.featureSnapshot)).not.toContain('card-delivery.invalid');
    expect(storedRiskEvent.senderHash).toBeNull();
    expect(storedRiskEvent.urls).toEqual([
      expect.objectContaining({
        normalizedDomain: 'card-delivery.invalid',
        normalizedUrlHash: canonicalUrl.normalizedUrlHash,
        reputation: 'MALICIOUS',
      }),
    ]);

    const rawText = '건강보험공단입니다. 오늘까지 아래 계좌로 미납금을 입금하세요.';
    const rawRiskEventRequest = {
      eventId: '00000000-0000-4000-8000-000000000002',
      features: {
        contentAvailable: true,
        contentTruncated: false,
        extractionComplete: false,
        impersonatedEntityTypes: [],
        normalizedLength: rawText.length,
        requestsAppInstall: false,
        requestsPayment: false,
        requestsRemoteControl: false,
        requestsSecret: false,
        riskKeywordIds: [],
      },
      occurredAt: '2026-07-28T12:01:00.000Z',
      policyVersion: '2026-07-28.1',
      rawText,
      schemaVersion: 1,
      type: 'MANUAL',
      urls: [],
    };

    await request(app.getHttpServer())
      .post('/v1/risk-events')
      .set('Authorization', `Bearer ${activationResponse.body.deviceCredential as string}`)
      .set('Idempotency-Key', 'integration-raw-risk-denied')
      .send(rawRiskEventRequest)
      .expect(403);

    await prisma.consent.create({
      data: {
        deviceId: storedDevice.id,
        grantedAt: new Date(),
        status: 'GRANTED',
        subjectId,
        textVersion: 'raw-server-analysis-v1',
        type: 'RAW_SERVER_ANALYSIS',
      },
    });

    pushFailure = new PushDeliveryError('messaging/server-unavailable', false);
    const rawRiskResponse = await request(app.getHttpServer())
      .post('/v1/risk-events')
      .set('Authorization', `Bearer ${activationResponse.body.deviceCredential as string}`)
      .set('Idempotency-Key', 'integration-raw-risk-approved')
      .send(rawRiskEventRequest)
      .expect(201);
    expect(rawRiskResponse.body).toMatchObject({
      category: 'GOVERNMENT_IMPERSONATION',
      completeness: 'FINAL',
      level: 'CRITICAL',
      score: 40,
    });

    const storedRawRiskEvent = await prisma.riskEvent.findUniqueOrThrow({
      where: { id: rawRiskResponse.body.id as string },
    });
    expect(JSON.stringify(storedRawRiskEvent)).not.toContain(rawText);
    expect(storedRawRiskEvent.featureSnapshot).toMatchObject({
      requestsPayment: true,
    });

    const rawIncident = await prisma.incident.findUniqueOrThrow({
      where: { riskEventId: rawRiskResponse.body.id as string },
    });
    await expect(outboxWorker.processBatch()).resolves.toBe(1);
    const retryingOutbox = await prisma.notificationOutbox.findFirstOrThrow({
      where: { incidentId: rawIncident.id },
      include: { deliveries: true },
    });
    expect(retryingOutbox).toMatchObject({
      attemptCount: 1,
      lastErrorCode: 'messaging/server-unavailable',
      status: 'PENDING',
    });
    expect(retryingOutbox.deliveries).toEqual([
      expect.objectContaining({
        errorCode: 'messaging/server-unavailable',
        status: 'FAILED',
      }),
    ]);

    pushFailure = null;
    await prisma.notificationOutbox.update({
      where: { id: retryingOutbox.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await expect(outboxWorker.processBatch()).resolves.toBe(1);
    expect(
      await prisma.notificationOutbox.findUniqueOrThrow({
        where: { id: retryingOutbox.id },
      }),
    ).toMatchObject({
      attemptCount: 2,
      status: 'SENT',
    });
  });
});
