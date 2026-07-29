import { describe, expect, it } from 'vitest';
import { isRiskLevel } from './risk';

describe('isRiskLevel', () => {
  it.each(['UNKNOWN', 'SAFE', 'CAUTION', 'HIGH', 'CRITICAL'])(
    'accepts the supported %s level',
    (level) => {
      expect(isRiskLevel(level)).toBe(true);
    },
  );

  it.each([null, undefined, 'DANGER', 3, {}])('rejects unsupported input %j', (value) => {
    expect(isRiskLevel(value)).toBe(false);
  });
});
