import { Injectable } from '@nestjs/common';

export const URL_REPUTATION_PROVIDER = Symbol('URL_REPUTATION_PROVIDER');

export type ReputationVerdict = 'CLEAR' | 'MALICIOUS' | 'SUSPICIOUS' | 'UNAVAILABLE';

export type CanonicalUrl = {
  canonical: string;
  normalizedDomain: string;
  normalizedUrlHash: string;
};

export type UrlReputationLookup = {
  normalizedUrlHash: string;
  verdict: ReputationVerdict;
};

export interface UrlReputationProvider {
  check(urls: readonly CanonicalUrl[]): Promise<readonly UrlReputationLookup[]>;
}

@Injectable()
export class UnavailableUrlReputationProvider implements UrlReputationProvider {
  check(urls: readonly CanonicalUrl[]): Promise<readonly UrlReputationLookup[]> {
    return Promise.resolve(
      urls.map((url) => ({
        normalizedUrlHash: url.normalizedUrlHash,
        verdict: 'UNAVAILABLE' as const,
      })),
    );
  }
}
