import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { FirebaseGuardianIdentityVerifier } from './firebase-guardian-identity.verifier';
import { GuardianAccountGuard } from './guardian-account.guard';
import { GUARDIAN_IDENTITY_VERIFIER } from './guardian-identity';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    FirebaseAuthGuard,
    GuardianAccountGuard,
    FirebaseGuardianIdentityVerifier,
    {
      provide: GUARDIAN_IDENTITY_VERIFIER,
      useExisting: FirebaseGuardianIdentityVerifier,
    },
  ],
  exports: [AuthService, FirebaseAuthGuard, GuardianAccountGuard, GUARDIAN_IDENTITY_VERIFIER],
})
export class AuthModule {}
