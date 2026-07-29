import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { TokenService } from '../security/token.service';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1_000;
const MAX_BUCKETS_BEFORE_CLEANUP = 1_000;

type RateBucket = {
  attempts: number;
  resetAt: number;
};

@Injectable()
export class ActivationPreviewRateLimiter {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  assertAllowed(ipAddress: string, deviceInstallationId: string, now = Date.now()): void {
    const keys = [
      this.tokens.digestRateLimitKey('ip', ipAddress),
      this.tokens.digestRateLimitKey('device', deviceInstallationId),
    ];
    const nextBuckets = keys.map((key) => ({
      key,
      value: this.nextBucket(this.buckets.get(key), now),
    }));
    if (nextBuckets.some(({ value }) => value.attempts > RATE_LIMIT)) {
      throw new HttpException(
        {
          code: 'ACTIVATION_PREVIEW_RATE_LIMITED',
          message: 'Too many activation preview attempts',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    nextBuckets.forEach(({ key, value }) => this.buckets.set(key, value));
    if (this.buckets.size > MAX_BUCKETS_BEFORE_CLEANUP) {
      this.removeExpired(now);
    }
  }

  private nextBucket(current: RateBucket | undefined, now: number): RateBucket {
    if (current === undefined || current.resetAt <= now) {
      return {
        attempts: 1,
        resetAt: now + RATE_WINDOW_MS,
      };
    }
    return {
      attempts: current.attempts + 1,
      resetAt: current.resetAt,
    };
  }

  private removeExpired(now: number): void {
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
