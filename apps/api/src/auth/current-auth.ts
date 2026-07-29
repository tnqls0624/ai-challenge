import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, GuardianPrincipal } from './authenticated-request';
import type { GuardianIdentity } from './guardian-identity';

export const CurrentGuardianIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GuardianIdentity => {
    const identity = context.switchToHttp().getRequest<AuthenticatedRequest>().guardianIdentity;
    if (identity === undefined) {
      throw new UnauthorizedException('Guardian identity is unavailable');
    }
    return identity;
  },
);

export const CurrentGuardian = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GuardianPrincipal => {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().guardianPrincipal;
    if (principal === undefined) {
      throw new UnauthorizedException('Guardian account is unavailable');
    }
    return principal;
  },
);
