import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { PrismaService } from '../database/prisma.service';
import { DeviceStatus } from '../generated/prisma/enums';
import { TokenService } from '../security/token.service';

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const credential = parseBearerCredential(request.headers.authorization);
    const device = await this.prisma.device.findUnique({
      where: {
        credentialDigest: this.tokens.digestDeviceCredential(credential),
      },
      select: {
        id: true,
        status: true,
        subjectId: true,
      },
    });
    if (device === null || device.status !== DeviceStatus.ACTIVE) {
      throw invalidDeviceCredential();
    }
    request.devicePrincipal = {
      id: device.id,
      subjectId: device.subjectId,
    };
    return true;
  }
}

function parseBearerCredential(authorization: string | undefined): string {
  if (authorization === undefined) {
    throw invalidDeviceCredential();
  }
  const parts = authorization.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer' || !parts[1]) {
    throw invalidDeviceCredential();
  }
  return parts[1];
}

function invalidDeviceCredential(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_DEVICE_CREDENTIAL',
    message: 'A valid active device credential is required',
  });
}
