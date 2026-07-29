const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export type IncidentActionItem = {
  actionId: string;
  completedAt: string | null;
  id: string;
  sortOrder: number;
  status: 'PENDING' | 'COMPLETED';
  title: string;
};

export type Incident = {
  actionItems: IncidentActionItem[];
  eventType: 'CALL' | 'MANUAL' | 'SMS' | 'URL';
  id: string;
  notificationStatus: 'CANCELLED' | 'FAILED' | 'PENDING' | 'PROCESSING' | 'SENT' | null;
  occurredAt: string;
  riskLevel: 'CAUTION' | 'CRITICAL' | 'HIGH' | 'SAFE' | 'UNKNOWN';
  senderMasked: string | null;
  shareLevel: 'BASIC' | 'MINIMAL';
  signalTypes: string[];
  stage: 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | null;
  status: 'ACKNOWLEDGED' | 'ESCALATED' | 'IN_PROGRESS' | 'OPEN' | 'RESOLVED';
  subjectDisplayName: string;
  subjectId: string;
  summary: string | null;
  summarySource: 'OPENAI' | 'TEMPLATE' | null;
  updatedAt: string;
  version: number;
};

export class GuardianApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function guardianApi<T>(
  path: string,
  idToken: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    throw new GuardianApiError(
      response.status,
      body?.code ?? 'API_REQUEST_FAILED',
      body?.message ?? '요청을 처리하지 못했습니다.',
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
