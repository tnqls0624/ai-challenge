import type { Request } from 'express';
import type { GuardianIdentity } from './guardian-identity';

export type GuardianPrincipal = {
  displayName: string;
  email: string | null;
  firebaseUid: string;
  id: string;
};

export type DevicePrincipal = {
  id: string;
  subjectId: string;
};

export type AuthenticatedRequest = Request & {
  devicePrincipal?: DevicePrincipal;
  guardianIdentity?: GuardianIdentity;
  guardianPrincipal?: GuardianPrincipal;
};
