import { describe, expect, it } from 'vitest';
import nextConfig, { SECURITY_HEADERS } from '../next.config';

describe('web security headers', () => {
  it('blocks cross-origin framing on every route', async () => {
    const headers = await nextConfig.headers?.();

    expect(headers).toEqual([
      {
        headers: [...SECURITY_HEADERS],
        source: '/:path*',
      },
    ]);
    expect(SECURITY_HEADERS).toContainEqual({
      key: 'Content-Security-Policy',
      value: expect.stringContaining("frame-ancestors 'none'"),
    });
    expect(SECURITY_HEADERS).toContainEqual({
      key: 'X-Frame-Options',
      value: 'DENY',
    });
  });
});
