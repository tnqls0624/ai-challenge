import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DEFAULT_DEVICE_MINUTE_LIMIT = 6;
const DEFAULT_GLOBAL_DAILY_LIMIT = 500;

type WindowCounter = {
  count: number;
  windowStart: number;
};

@Injectable()
export class ExplanationBudgetService {
  private globalDaily: WindowCounter = { count: 0, windowStart: 0 };
  private readonly deviceMinutes = new Map<string, WindowCounter>();

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  tryConsume(scope: string, now = Date.now()): boolean {
    const deviceLimit = this.readLimit('LLM_DEVICE_MINUTE_LIMIT', DEFAULT_DEVICE_MINUTE_LIMIT);
    const globalLimit = this.readLimit('LLM_GLOBAL_DAILY_LIMIT', DEFAULT_GLOBAL_DAILY_LIMIT);
    const minuteStart = Math.floor(now / MINUTE_MS) * MINUTE_MS;
    const dayStart = Math.floor(now / DAY_MS) * DAY_MS;

    if (this.globalDaily.windowStart !== dayStart) {
      this.globalDaily = { count: 0, windowStart: dayStart };
    }
    const deviceCounter = this.deviceMinutes.get(scope);
    const currentDeviceCounter =
      deviceCounter?.windowStart === minuteStart
        ? deviceCounter
        : { count: 0, windowStart: minuteStart };

    if (this.globalDaily.count >= globalLimit || currentDeviceCounter.count >= deviceLimit) {
      return false;
    }

    this.globalDaily.count += 1;
    currentDeviceCounter.count += 1;
    this.deviceMinutes.set(scope, currentDeviceCounter);
    this.pruneDeviceCounters(minuteStart);
    return true;
  }

  private readLimit(name: string, defaultValue: number): number {
    const configured = this.config.get<number | string>(name);
    const value = Number(configured ?? defaultValue);
    return Number.isSafeInteger(value) && value > 0 ? value : defaultValue;
  }

  private pruneDeviceCounters(currentMinuteStart: number): void {
    if (this.deviceMinutes.size <= 1_000) return;
    for (const [scope, counter] of this.deviceMinutes) {
      if (counter.windowStart < currentMinuteStart) {
        this.deviceMinutes.delete(scope);
      }
    }
  }
}
