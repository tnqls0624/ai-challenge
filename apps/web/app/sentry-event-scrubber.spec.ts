import { describe, expect, it } from 'vitest';
import { scrubSentryEvent } from '../lib/sentry-event-scrubber';

describe('scrubSentryEvent', () => {
  it('keeps route-level evidence while removing request and user data', () => {
    const event = scrubSentryEvent({
      breadcrumbs: [{ message: 'clicked with account 1234' }],
      exception: { values: [{ value: 'guardian@example.test' }] },
      extra: { idToken: 'secret' },
      request: {
        headers: { authorization: 'Bearer secret' },
        query_string: 'activationCode=123456',
        url: '/dashboard?activationCode=123456',
      },
      user: { id: 'guardian-id' },
    });

    expect(event).toEqual({
      exception: { values: [{ value: 'Application error' }] },
      request: { url: '/dashboard' },
    });
  });
});
