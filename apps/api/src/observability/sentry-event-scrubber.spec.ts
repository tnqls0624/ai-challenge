import { describe, expect, it } from 'vitest';
import { scrubSentryEvent } from './sentry-event-scrubber';

describe('scrubSentryEvent', () => {
  it('removes request secrets, PII context, breadcrumbs, and exception messages', () => {
    const event = scrubSentryEvent({
      breadcrumbs: [{ message: 'raw message' }],
      exception: { values: [{ value: 'Bearer secret-token' }] },
      extra: { message: 'raw message' },
      message: 'phone 010-1234-5678',
      request: {
        cookies: { session: 'secret' },
        data: { rawText: 'raw message' },
        headers: { authorization: 'Bearer secret-token' },
        query_string: 'token=secret',
        url: 'https://api.example.test/v1/risk-events?token=secret#fragment',
      },
      user: { email: 'guardian@example.test' },
    });

    expect(event).toEqual({
      exception: { values: [{ value: 'Application error' }] },
      message: 'Application error',
      request: {
        url: 'https://api.example.test/v1/risk-events',
      },
    });
  });
});
