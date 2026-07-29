import { Body, Controller, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { GuardianPrincipal } from '../auth/authenticated-request';
import { CurrentGuardian } from '../auth/current-auth';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { GuardianAccountGuard } from '../auth/guardian-account.guard';
import {
  ActivationCodeResponseDto,
  CreateSubjectRequestDto,
  SubjectResponseDto,
} from './subjects.dto';
import { SubjectsService } from './subjects.service';

@ApiTags('subjects')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, GuardianAccountGuard)
@Controller('subjects')
export class SubjectsController {
  constructor(@Inject(SubjectsService) private readonly subjectsService: SubjectsService) {}

  @Post()
  @ApiBody({ type: CreateSubjectRequestDto })
  @ApiCreatedResponse({ type: SubjectResponseDto })
  createSubject(
    @CurrentGuardian() guardian: GuardianPrincipal,
    @Body() request: CreateSubjectRequestDto,
  ): Promise<SubjectResponseDto> {
    return this.subjectsService.createSubject(guardian, request);
  }

  @Post(':id/activation-codes')
  @ApiCreatedResponse({ type: ActivationCodeResponseDto })
  issueActivationCode(
    @CurrentGuardian() guardian: GuardianPrincipal,
    @Param('id', ParseUUIDPipe) subjectId: string,
  ): Promise<ActivationCodeResponseDto> {
    return this.subjectsService.issueActivationCode(guardian, subjectId);
  }
}
