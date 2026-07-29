import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, DevicePrincipal } from '../auth/authenticated-request';

export const CurrentDevice = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DevicePrincipal => {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().devicePrincipal;
    if (principal === undefined) {
      throw new UnauthorizedException('Device credential is unavailable');
    }
    return principal;
  },
);
