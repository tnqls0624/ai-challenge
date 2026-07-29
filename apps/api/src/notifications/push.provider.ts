import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getMessaging } from 'firebase-admin/messaging';
import { getOrCreateFirebaseAdminApp } from '../firebase/firebase-admin-app';

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export type PushNotification = {
  incidentId: string;
  notificationId: string;
  riskLevel: 'CRITICAL' | 'HIGH';
  subjectDisplayName: string;
};

export type PushSendResult = {
  providerMessageId: string;
};

export interface PushProvider {
  send(registrationToken: string, notification: PushNotification): Promise<PushSendResult>;
}

export class PushDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly permanent: boolean,
  ) {
    super(code);
  }
}

@Injectable()
export class FirebasePushProvider implements PushProvider {
  private readonly firebaseClientEmail: string | undefined;
  private readonly firebasePrivateKey: string | undefined;
  private readonly firebaseProjectId: string | undefined;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.firebaseClientEmail = configService.get<string>('FIREBASE_CLIENT_EMAIL');
    this.firebasePrivateKey = configService.get<string>('FIREBASE_PRIVATE_KEY');
    this.firebaseProjectId = configService.get<string>('FIREBASE_PROJECT_ID');
  }

  async send(registrationToken: string, notification: PushNotification): Promise<PushSendResult> {
    if (this.firebaseProjectId === undefined) {
      throw new PushDeliveryError('PUSH_NOT_CONFIGURED', false);
    }
    try {
      const providerMessageId = await getMessaging(this.getOrCreateApp()).send({
        data: {
          incidentId: notification.incidentId,
          notificationId: notification.notificationId,
          riskLevel: notification.riskLevel,
        },
        notification: {
          body: `${notification.subjectDisplayName}님의 상황을 지금 확인해 주세요.`,
          title:
            notification.riskLevel === 'CRITICAL'
              ? '매우 위험한 상황이 감지되었습니다'
              : '위험한 상황이 감지되었습니다',
        },
        token: registrationToken,
        webpush: {
          fcmOptions: {
            link: `/incidents/${notification.incidentId}`,
          },
        },
      });
      return { providerMessageId };
    } catch (error) {
      if (error instanceof PushDeliveryError) {
        throw error;
      }
      const code = readFirebaseErrorCode(error);
      throw new PushDeliveryError(code, isPermanentFirebaseError(code));
    }
  }

  private getOrCreateApp() {
    const projectId = this.firebaseProjectId;
    if (projectId === undefined) {
      throw new PushDeliveryError('PUSH_NOT_CONFIGURED', false);
    }
    return getOrCreateFirebaseAdminApp({
      clientEmail: this.firebaseClientEmail,
      privateKey: this.firebasePrivateKey,
      projectId,
    });
  }
}

function readFirebaseErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code.slice(0, 80);
  }
  return 'PUSH_PROVIDER_ERROR';
}

function isPermanentFirebaseError(code: string): boolean {
  return [
    'messaging/invalid-argument',
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
  ].includes(code);
}
