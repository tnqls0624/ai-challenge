import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './authenticated-request';
import { GUARDIAN_IDENTITY_VERIFIER, type GuardianIdentityVerifier } from './guardian-identity';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    @Inject(GUARDIAN_IDENTITY_VERIFIER)
    private readonly identityVerifier: GuardianIdentityVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = parseBearerToken(authorization);
    request.guardianIdentity = await this.identityVerifier.verifyIdToken(token);
    return true;
  }
}

function parseBearerToken(authorization: string | undefined): string {
  if (authorization === undefined) {
    throw invalidAuthorization();
  }
  const parts = authorization.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer' || !parts[1]) {
    throw invalidAuthorization();
  }
  return parts[1];
}

function invalidAuthorization(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'GUARDIAN_TOKEN_REQUIRED',
    message: 'A Bearer guardian token is required',
  });
}
