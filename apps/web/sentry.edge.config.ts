import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from './lib/sentry-event-scrubber';

const dsn = process.env.SENTRY_DSN;

if (dsn !== undefined && dsn.length > 0) {
  Sentry.init({
    beforeSend: (event) => scrubSentryEvent(event),
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    maxBreadcrumbs: 0,
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}
