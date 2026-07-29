import { Module } from '@nestjs/common';
import { ExplanationBudgetService } from './explanation-budget.service';
import { ExplanationService } from './explanation.service';
import { EXPLANATION_PROVIDER } from './explanation.provider';
import { OpenAiExplanationProvider } from './openai-explanation.provider';

@Module({
  providers: [
    ExplanationBudgetService,
    ExplanationService,
    OpenAiExplanationProvider,
    {
      provide: EXPLANATION_PROVIDER,
      useExisting: OpenAiExplanationProvider,
    },
  ],
  exports: [ExplanationService],
})
export class ExplanationsModule {}
