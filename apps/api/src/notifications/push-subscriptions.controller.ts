import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { GuardianPrincipal } from '../auth/authenticated-request';
import { CurrentGuardian } from '../auth/current-auth';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { GuardianAccountGuard } from '../auth/guardian-account.guard';
import {
  CreatePushSubscriptionRequestDto,
  PushSubscriptionResponseDto,
} from './push-subscriptions.dto';
import { PushSubscriptionsService } from './push-subscriptions.service';

@ApiTags('guardian-push-subscriptions')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, GuardianAccountGuard)
@Controller('guardian-push-subscriptions')
export class PushSubscriptionsController {
  constructor(
    @Inject(PushSubscriptionsService)
    private readonly subscriptionsService: PushSubscriptionsService,
  ) {}

  @Post()
  @ApiBody({ type: CreatePushSubscriptionRequestDto })
  @ApiCreatedResponse({ type: PushSubscriptionResponseDto })
  register(
    @CurrentGuardian() guardian: GuardianPrincipal,
    @Body() request: CreatePushSubscriptionRequestDto,
  ): Promise<PushSubscriptionResponseDto> {
    return this.subscriptionsService.register(guardian, request);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  revoke(
    @CurrentGuardian() guardian: GuardianPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.subscriptionsService.revoke(guardian, id);
  }
}
