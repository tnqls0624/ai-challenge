type ScrubbableSentryEvent = {
  breadcrumbs?: unknown;
  exception?: {
    values?: Array<{
      value?: string;
    }>;
  };
  extra?: unknown;
  message?: string;
  request?: {
    cookies?: unknown;
    data?: unknown;
    headers?: unknown;
    query_string?: unknown;
    url?: string;
  };
  user?: unknown;
};

export function scrubSentryEvent<T extends ScrubbableSentryEvent>(event: T): T {
  delete event.breadcrumbs;
  delete event.extra;
  delete event.user;

  if (event.request !== undefined) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url !== undefined) {
      event.request.url = stripUrlQuery(event.request.url);
    }
  }

  if (event.message !== undefined) {
    event.message = 'Application error';
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value !== undefined) {
      exception.value = 'Application error';
    }
  }
  return event;
}

function stripUrlQuery(value: string): string {
  const queryIndex = value.search(/[?#]/u);
  return queryIndex === -1 ? value : value.slice(0, queryIndex);
}
