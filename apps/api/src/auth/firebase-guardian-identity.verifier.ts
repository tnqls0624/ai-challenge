import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getOrCreateFirebaseAdminApp } from '../firebase/firebase-admin-app';
import type { GuardianIdentity, GuardianIdentityVerifier } from './guardian-identity';

@Injectable()
export class FirebaseGuardianIdentityVerifier implements GuardianIdentityVerifier {
  private readonly firebaseClientEmail: string | undefined;
  private readonly firebasePrivateKey: string | undefined;
  private readonly firebaseProjectId: string | undefined;
  private auth: Auth | undefined;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.firebaseClientEmail = configService.get<string>('FIREBASE_CLIENT_EMAIL');
    this.firebasePrivateKey = configService.get<string>('FIREBASE_PRIVATE_KEY');
    this.firebaseProjectId = configService.get<string>('FIREBASE_PROJECT_ID');
  }

  async verifyIdToken(token: string): Promise<GuardianIdentity> {
    if (this.firebaseProjectId === undefined) {
      throw new ServiceUnavailableException({
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Guardian authentication is not configured',
      });
    }

    try {
      const decoded = await this.getAuth().verifyIdToken(token, true);
      return {
        email: decoded.email_verified === true ? (decoded.email ?? null) : null,
        firebaseUid: decoded.uid,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new UnauthorizedException({
        code: 'INVALID_GUARDIAN_TOKEN',
        message: 'Guardian token is invalid or expired',
      });
    }
  }

  private getAuth(): Auth {
    this.auth ??= getAuth(this.getOrCreateApp());
    return this.auth;
  }

  private getOrCreateApp() {
    const projectId = this.firebaseProjectId;
    if (projectId === undefined) {
      throw new ServiceUnavailableException({
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Guardian authentication is not configured',
      });
    }
    return getOrCreateFirebaseAdminApp({
      clientEmail: this.firebaseClientEmail,
      privateKey: this.firebasePrivateKey,
      projectId,
    });
  }
}
