export type GuardianIdentity = {
  email: string | null;
  firebaseUid: string;
};

export interface GuardianIdentityVerifier {
  verifyIdToken(token: string): Promise<GuardianIdentity>;
}

export const GUARDIAN_IDENTITY_VERIFIER = Symbol('GUARDIAN_IDENTITY_VERIFIER');
