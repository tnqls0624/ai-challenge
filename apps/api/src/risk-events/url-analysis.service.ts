import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { UrlReputation } from '@dont-worry/risk-engine';
import type { RiskEventUrlDto } from './risk-events.dto';
import {
  URL_REPUTATION_PROVIDER,
  type CanonicalUrl,
  type ReputationVerdict,
  type UrlReputationProvider,
  type UrlReputationLookup,
} from './url-reputation.provider';

const SHORTENER_DOMAINS = new Set(['bit.ly', 'han.gl', 'tinyurl.com', 'url.kr', 'vo.la']);

export type AnalyzedUrl = CanonicalUrl & {
  reputation: UrlReputation;
};

@Injectable()
export class UrlAnalysisService {
  constructor(
    @Inject(URL_REPUTATION_PROVIDER)
    private readonly reputationProvider: UrlReputationProvider,
  ) {}

  async analyze(urls: readonly CanonicalUrl[]): Promise<{
    reputationComplete: boolean;
    urls: AnalyzedUrl[];
  }> {
    const uniqueUrls = deduplicateUrls(urls);
    let lookups: readonly UrlReputationLookup[];
    try {
      lookups = await this.reputationProvider.check(uniqueUrls);
    } catch {
      lookups = uniqueUrls.map((url) => ({
        normalizedUrlHash: url.normalizedUrlHash,
        verdict: 'UNAVAILABLE' as const,
      }));
    }
    const lookupByHash = new Map(
      lookups.map((lookup) => [lookup.normalizedUrlHash, lookup.verdict]),
    );
    const analyzed = uniqueUrls.map((url) => {
      const externalVerdict = lookupByHash.get(url.normalizedUrlHash) ?? 'UNAVAILABLE';
      return {
        ...url,
        reputation: resolveReputation(url, externalVerdict),
      };
    });

    return {
      reputationComplete:
        analyzed.length === 0 ||
        analyzed.every((url) => {
          const verdict = lookupByHash.get(url.normalizedUrlHash);
          return verdict !== undefined && verdict !== 'UNAVAILABLE';
        }),
      urls: analyzed,
    };
  }
}

export function canonicalizeUrl(rawValue: string): CanonicalUrl {
  if (rawValue.length > 2_048) {
    throw invalidUrl('URL is longer than 2048 characters');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw invalidUrl('URL must be an absolute HTTP(S) URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw invalidUrl('URL must use HTTP or HTTPS');
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw invalidUrl('URL userinfo is not allowed');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (
    hostname.length === 0 ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'metadata.google.internal' ||
    isPrivateOrReservedAddress(hostname)
  ) {
    throw invalidUrl('URL target is private, local, or reserved');
  }

  parsed.hostname = hostname;
  parsed.hash = '';
  const canonical = parsed.toString();
  return {
    canonical,
    normalizedDomain: hostname,
    normalizedUrlHash: createHash('sha256').update(canonical, 'utf8').digest('hex'),
  };
}

export function validateCanonicalUrls(inputs: readonly RiskEventUrlDto[]): CanonicalUrl[] {
  return inputs.map((input) => validateCanonicalUrl(input));
}

function validateCanonicalUrl(input: RiskEventUrlDto): CanonicalUrl {
  const canonical = canonicalizeUrl(input.canonical);
  if (
    canonical.canonical !== input.canonical ||
    canonical.normalizedDomain !== input.normalizedDomain.toLowerCase() ||
    canonical.normalizedUrlHash !== input.normalizedUrlHash
  ) {
    throw new BadRequestException({
      code: 'URL_NORMALIZATION_MISMATCH',
      message: 'Submitted URL normalization fields do not match the canonical URL',
    });
  }
  return canonical;
}

function deduplicateUrls(urls: readonly CanonicalUrl[]): CanonicalUrl[] {
  return [...new Map(urls.map((url) => [url.normalizedUrlHash, url])).values()];
}

function resolveReputation(url: CanonicalUrl, externalVerdict: ReputationVerdict): UrlReputation {
  if (externalVerdict === 'MALICIOUS') {
    return 'MALICIOUS';
  }
  if (externalVerdict === 'SUSPICIOUS' || looksSuspicious(url.normalizedDomain)) {
    return 'SUSPICIOUS';
  }
  if (SHORTENER_DOMAINS.has(url.normalizedDomain)) {
    return 'SHORTENED';
  }
  return externalVerdict;
}

function looksSuspicious(hostname: string): boolean {
  return (
    hostname.startsWith('xn--') ||
    hostname.split('.').some((label) => label.startsWith('xn--')) ||
    isIP(stripIpv6Brackets(hostname)) !== 0 ||
    hostname.split('.').length > 5
  );
}

function isPrivateOrReservedAddress(hostname: string): boolean {
  const address = stripIpv6Brackets(hostname).toLowerCase();
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split('.').map(Number);
    const first = parts[0] ?? 0;
    const second = parts[1] ?? 0;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  if (version === 6) {
    return (
      address === '::' ||
      address === '::1' ||
      address.startsWith('fc') ||
      address.startsWith('fd') ||
      address.startsWith('fe8') ||
      address.startsWith('fe9') ||
      address.startsWith('fea') ||
      address.startsWith('feb') ||
      address.startsWith('::ffff:127.') ||
      address.startsWith('::ffff:10.') ||
      address.startsWith('::ffff:192.168.')
    );
  }
  return false;
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function invalidUrl(message: string): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_URL',
    message,
  });
}
