import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ExplanationInput,
  ExplanationProvider,
  ProviderExplanation,
} from './explanation.provider';

const OUTPUT_SCHEMA = {
  additionalProperties: false,
  properties: {
    body: { maxLength: 300, minLength: 1, type: 'string' },
    groundingActionIds: {
      items: { type: 'string' },
      maxItems: 4,
      type: 'array',
    },
    groundingSignalTypes: {
      items: { type: 'string' },
      maxItems: 3,
      type: 'array',
    },
    incidentSummary: { maxLength: 400, minLength: 1, type: 'string' },
    title: { maxLength: 80, minLength: 1, type: 'string' },
  },
  required: ['title', 'body', 'incidentSummary', 'groundingSignalTypes', 'groundingActionIds'],
  type: 'object',
} as const;

@Injectable()
export class OpenAiExplanationProvider implements ExplanationProvider {
  private readonly apiKey: string | undefined;
  private readonly model: string | undefined;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>('OPENAI_EXPLANATION_MODEL');
  }

  async explain(input: ExplanationInput): Promise<ProviderExplanation> {
    if (this.apiKey === undefined || this.model === undefined) {
      throw new Error('OpenAI explanation provider is not configured');
    }
    const client = new OpenAI({
      apiKey: this.apiKey,
      maxRetries: 0,
    });
    const response = await client.responses.create(
      {
        input: JSON.stringify(input),
        instructions: [
          '당신은 고령 사용자와 보호자에게 금융사기 위험을 쉽게 설명합니다.',
          '입력의 위험 수준, 사건 단계, 근거, 행동 ID는 이미 확정되었습니다.',
          '위험 수준과 행동을 바꾸거나 입력에 없는 사실을 추가하지 마세요.',
          '보이스피싱을 확정적으로 단정하거나 공포를 과장하지 마세요.',
          '전화번호, 계좌번호, URL, 개인정보를 만들거나 출력하지 마세요.',
          'groundingSignalTypes와 groundingActionIds에는 실제 문장에 사용한 입력 ID만 넣으세요.',
          'title은 짧은 결과 제목, body는 근거와 첫 행동, incidentSummary는 보호자 인계용 요약입니다.',
          '쉬운 한국어 존댓말을 사용하고 제공된 JSON schema로만 응답하세요.',
        ].join(' '),
        max_output_tokens: 300,
        model: this.model,
        store: false,
        text: {
          format: {
            name: 'dont_worry_explanation',
            schema: OUTPUT_SCHEMA,
            strict: true,
            type: 'json_schema',
          },
        },
      },
      {
        timeout: 1_500,
      },
    );
    const parsed = JSON.parse(response.output_text) as unknown;
    if (!isProviderExplanation(parsed)) {
      throw new Error('OpenAI explanation output did not match the expected schema');
    }
    return parsed;
  }
}

function isProviderExplanation(value: unknown): value is ProviderExplanation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === 'string' &&
    typeof record.body === 'string' &&
    typeof record.incidentSummary === 'string' &&
    Array.isArray(record.groundingSignalTypes) &&
    record.groundingSignalTypes.every((item) => typeof item === 'string') &&
    Array.isArray(record.groundingActionIds) &&
    record.groundingActionIds.every((item) => typeof item === 'string')
  );
}
