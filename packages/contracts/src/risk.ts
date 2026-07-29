export const RISK_LEVELS = ['UNKNOWN', 'SAFE', 'CAUTION', 'HIGH', 'CRITICAL'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && RISK_LEVELS.includes(value as RiskLevel);
}

export const RISK_EVENT_TYPES = ['SMS', 'CALL', 'URL', 'MANUAL'] as const;
export type RiskEventType = (typeof RISK_EVENT_TYPES)[number];

export const ANALYSIS_CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type AnalysisConfidence = (typeof ANALYSIS_CONFIDENCES)[number];

export const ANALYSIS_COMPLETENESS = ['PROVISIONAL', 'FINAL', 'FINALIZED_PARTIAL'] as const;
export type AnalysisCompleteness = (typeof ANALYSIS_COMPLETENESS)[number];

export const RISK_CATEGORIES = [
  'UNCLASSIFIED',
  'GOVERNMENT_IMPERSONATION',
  'FAMILY_IMPERSONATION',
  'FINANCIAL_FRAUD',
  'MALWARE_INSTALLATION',
  'CREDENTIAL_THEFT',
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_SIGNAL_GROUPS = [
  'URL_REPUTATION',
  'RISKY_ACTION',
  'IMPERSONATION_PRESSURE',
  'PHONE_REPUTATION',
  'CORRELATION',
] as const;
export type RiskSignalGroup = (typeof RISK_SIGNAL_GROUPS)[number];

export const RISK_SIGNAL_TYPES = [
  'VERIFIED_MALICIOUS_URL',
  'SUSPICIOUS_DOMAIN',
  'SHORTENED_URL',
  'PAYMENT_REQUEST',
  'APP_INSTALL_REQUEST',
  'REMOTE_CONTROL_REQUEST',
  'SECRET_REQUEST',
  'IMPERSONATION_OR_PRESSURE',
  'REPORTED_PHONE',
  'RECENT_SUSPICIOUS_EVENT',
  'USER_CONFIRMED_LINK_OPENED',
  'USER_CONFIRMED_PERSONAL_INFO',
  'USER_CONFIRMED_APP_INSTALL',
  'USER_CONFIRMED_TRANSFER',
] as const;
export type RiskSignalType = (typeof RISK_SIGNAL_TYPES)[number];

export type RiskSignal = {
  evidence: string;
  group: RiskSignalGroup;
  score: number;
  source: 'CORRELATION' | 'KISA' | 'PHONE_REPUTATION' | 'RULE' | 'SAFE_BROWSING' | 'USER';
  type: RiskSignalType;
};

export type RiskDecision = {
  category: RiskCategory;
  completeness: AnalysisCompleteness;
  confidence: AnalysisConfidence;
  eventId: string;
  level: RiskLevel;
  policyVersion: string;
  recommendedActionIds: string[];
  score: number | null;
  signals: RiskSignal[];
};
