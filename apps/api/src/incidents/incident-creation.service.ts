import { Injectable } from '@nestjs/common';
import type { RiskDecision } from '@dont-worry/contracts';
import {
  AlertThreshold,
  CareConnectionStatus,
  type ExplanationSource,
  IncidentStage,
  ReceiveThreshold,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';

type StageAction = {
  actionId: string;
  sortOrder: number;
  title: string;
};

const STAGE_ACTIONS: Record<IncidentStage, readonly StageAction[]> = {
  S0: [
    { actionId: 'STOP_CONTACT', sortOrder: 0, title: '링크와 통화를 즉시 중단하기' },
    { actionId: 'VERIFY_OFFICIAL_CHANNEL', sortOrder: 1, title: '공식 대표번호로 직접 확인하기' },
    { actionId: 'CONTACT_GUARDIAN', sortOrder: 2, title: '보호자와 상황을 함께 확인하기' },
  ],
  S1: [
    { actionId: 'CLOSE_LINK', sortOrder: 0, title: '열어 둔 링크와 브라우저를 닫기' },
    { actionId: 'DO_NOT_INSTALL', sortOrder: 1, title: '파일과 앱을 설치하지 않기' },
    { actionId: 'VERIFY_OFFICIAL_CHANNEL', sortOrder: 2, title: '기관 공식번호로 사실 확인하기' },
  ],
  S2: [
    { actionId: 'CHANGE_CREDENTIALS', sortOrder: 0, title: '노출 가능성이 있는 비밀번호 변경하기' },
    {
      actionId: 'CONTACT_FINANCIAL_INSTITUTION',
      sortOrder: 1,
      title: '금융기관에 개인정보 노출 알리기',
    },
    { actionId: 'CHECK_ACCOUNTS', sortOrder: 2, title: '계정과 금융 거래 내역 확인하기' },
  ],
  S3: [
    {
      actionId: 'DISCONNECT_NETWORK',
      sortOrder: 0,
      title: '휴대전화의 Wi-Fi와 모바일 데이터 끄기',
    },
    { actionId: 'SEEK_MALWARE_HELP', sortOrder: 1, title: '공식 기관의 악성 앱 점검 도움받기' },
    {
      actionId: 'CHANGE_CREDENTIALS',
      sortOrder: 2,
      title: '안전한 다른 기기에서 비밀번호 변경하기',
    },
    { actionId: 'CONTACT_GUARDIAN', sortOrder: 3, title: '보호자와 후속 조치 함께 진행하기' },
  ],
  S4: [
    { actionId: 'CALL_112', sortOrder: 0, title: '즉시 112에 피해 사실 신고하기' },
    { actionId: 'REQUEST_PAYMENT_STOP', sortOrder: 1, title: '은행에 지급정지 요청하기' },
    {
      actionId: 'PRESERVE_EVIDENCE',
      sortOrder: 2,
      title: '문자·통화·이체 증거를 삭제하지 않고 보존하기',
    },
  ],
};

const STAGE_ORDER: Record<IncidentStage, number> = {
  S0: 0,
  S1: 1,
  S2: 2,
  S3: 3,
  S4: 4,
};

@Injectable()
export class IncidentCreationService {
  async createForDecision(
    transaction: Prisma.TransactionClient,
    event: {
      id: string;
      policyVersion: string;
      subjectId: string;
    },
    decision: RiskDecision,
    requestedStage: IncidentStage = IncidentStage.S0,
    explanation?: {
      source: ExplanationSource;
      summary: string;
    },
  ): Promise<string | null> {
    if (decision.level !== 'HIGH' && decision.level !== 'CRITICAL') {
      return null;
    }

    const existing = await transaction.incident.findUnique({
      where: { riskEventId: event.id },
    });
    const stage =
      existing === null || STAGE_ORDER[requestedStage] > STAGE_ORDER[existing.stage]
        ? requestedStage
        : existing.stage;
    const incident =
      existing === null
        ? await transaction.incident.create({
            data: {
              riskEventId: event.id,
              stage,
              subjectId: event.subjectId,
              ...(explanation === undefined
                ? {}
                : {
                    summary: explanation.summary,
                    summarySource: explanation.source,
                  }),
            },
          })
        : stage === existing.stage
          ? explanation === undefined
            ? existing
            : await transaction.incident.update({
                where: { id: existing.id },
                data: {
                  summary: explanation.summary,
                  summarySource: explanation.source,
                },
              })
          : await transaction.incident.update({
              where: { id: existing.id },
              data: {
                stage,
                ...(explanation === undefined
                  ? {}
                  : {
                      summary: explanation.summary,
                      summarySource: explanation.source,
                    }),
                version: { increment: 1 },
                history: {
                  create: {
                    fromStage: existing.stage,
                    toStage: stage,
                  },
                },
              },
            });
    await transaction.actionItem.createMany({
      data: actionsForStage(stage).map((action) => ({
        ...action,
        incidentId: incident.id,
        stage,
      })),
      skipDuplicates: true,
    });
    const connection = await transaction.careConnection.findFirst({
      where: {
        status: CareConnectionStatus.ACTIVE,
        subjectId: event.subjectId,
      },
    });
    if (
      connection !== null &&
      connection.pushEnabled &&
      allowsAutomaticNotification(
        decision.level,
        connection.autoAlertThreshold,
        connection.guardianReceiveThreshold,
      )
    ) {
      const dedupeKey = [
        'INCIDENT',
        incident.id,
        connection.guardianId,
        decision.level,
        event.policyVersion,
      ].join(':');
      await transaction.notificationOutbox.upsert({
        where: { dedupeKey },
        update: {},
        create: {
          connectionId: connection.id,
          dedupeKey,
          guardianId: connection.guardianId,
          incidentId: incident.id,
        },
      });
    }
    return incident.id;
  }
}

export function actionsForStage(stage: IncidentStage): readonly StageAction[] {
  return STAGE_ACTIONS[stage];
}

export function allowsAutomaticNotification(
  level: 'HIGH' | 'CRITICAL',
  subjectThreshold: AlertThreshold,
  guardianThreshold: ReceiveThreshold,
): boolean {
  if (
    subjectThreshold === AlertThreshold.NONE ||
    guardianThreshold === ReceiveThreshold.REQUEST_ONLY
  ) {
    return false;
  }
  if (level === 'CRITICAL') {
    return true;
  }
  return subjectThreshold === AlertThreshold.HIGH && guardianThreshold === ReceiveThreshold.HIGH;
}
