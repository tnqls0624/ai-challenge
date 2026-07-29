import { describe, expect, it } from 'vitest';
import { UrlAnalysisService, canonicalizeUrl } from './url-analysis.service';

describe('canonicalizeUrl', () => {
  it('normalizes host casing, default ports, and fragments', () => {
    expect(canonicalizeUrl('HTTPS://Example.INVALID:443/pay?q=1#private')).toEqual({
      canonical: 'https://example.invalid/pay?q=1',
      normalizedDomain: 'example.invalid',
      normalizedUrlHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it.each([
    'file:///etc/passwd',
    'http://localhost/admin',
    'http://127.0.0.1/admin',
    'http://10.0.0.1/admin',
    'http://[::1]/admin',
    'https://user:secret@example.invalid/',
  ])('rejects unsafe targets: %s', (url) => {
    expect(() => canonicalizeUrl(url)).toThrow();
  });

  it('falls back to an unavailable partial result when the provider fails', async () => {
    const canonical = canonicalizeUrl('https://example.invalid/check');
    const service = new UrlAnalysisService({
      check: () => Promise.reject(new Error('provider unavailable')),
    });

    await expect(service.analyze([canonical])).resolves.toEqual({
      reputationComplete: false,
      urls: [{ ...canonical, reputation: 'UNAVAILABLE' }],
    });
  });
});
