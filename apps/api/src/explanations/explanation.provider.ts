import type { RiskCategory, RiskLevel, RiskSignal } from '@dont-worry/contracts';
import type { IncidentStage } from '../generated/prisma/client';

export const EXPLANATION_PROVIDER = Symbol('EXPLANATION_PROVIDER');

export type ExplanationInput = {
  category: RiskCategory;
  incidentStage: IncidentStage;
  level: RiskLevel;
  recommendedActionIds: string[];
  signals: Array<Pick<RiskSignal, 'evidence' | 'type'>>;
};

export type ProviderExplanation = {
  body: string;
  groundingActionIds: string[];
  groundingSignalTypes: string[];
  incidentSummary: string;
  title: string;
};

export interface ExplanationProvider {
  explain(input: ExplanationInput): Promise<ProviderExplanation>;
}
