import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateGuardianSessionRequestDto, GuardianSessionResponseDto } from './auth.dto';
import { CurrentGuardianIdentity } from './current-auth';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import type { GuardianIdentity } from './guardian-identity';

@ApiTags('auth')
@Controller('auth/guardian')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiBody({ type: CreateGuardianSessionRequestDto })
  @ApiCreatedResponse({ type: GuardianSessionResponseDto })
  createSession(
    @CurrentGuardianIdentity() identity: GuardianIdentity,
    @Body() request: CreateGuardianSessionRequestDto,
  ): Promise<GuardianSessionResponseDto> {
    return this.authService.createSession(identity, request);
  }
}
