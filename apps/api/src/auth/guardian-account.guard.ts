import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './authenticated-request';
import { AuthService } from './auth.service';

@Injectable()
export class GuardianAccountGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const identity = request.guardianIdentity;
    if (identity === undefined) {
      throw new ForbiddenException({
        code: 'GUARDIAN_IDENTITY_MISSING',
        message: 'Guardian identity was not resolved',
      });
    }
    const principal = await this.authService.findGuardian(identity.firebaseUid);
    if (principal === null) {
      throw new ForbiddenException({
        code: 'GUARDIAN_SESSION_REQUIRED',
        message: 'Create a guardian session before accessing protected resources',
      });
    }
    request.guardianPrincipal = principal;
    return true;
  }
}
