import { describe, expect, it } from 'vitest';
import { AlertThreshold, ReceiveThreshold } from '../generated/prisma/enums';
import { IncidentStage } from '../generated/prisma/enums';
import { actionsForStage, allowsAutomaticNotification } from './incident-creation.service';

describe('allowsAutomaticNotification', () => {
  it.each([
    ['CRITICAL', 'CRITICAL', 'CRITICAL', true],
    ['CRITICAL', 'HIGH', 'HIGH', true],
    ['CRITICAL', 'NONE', 'HIGH', false],
    ['CRITICAL', 'CRITICAL', 'REQUEST_ONLY', false],
    ['HIGH', 'HIGH', 'HIGH', true],
    ['HIGH', 'CRITICAL', 'HIGH', false],
    ['HIGH', 'HIGH', 'CRITICAL', false],
  ] as const)(
    'combines %s risk with subject %s and guardian %s',
    (level, subjectThreshold, guardianThreshold, expected) => {
      expect(
        allowsAutomaticNotification(
          level,
          AlertThreshold[subjectThreshold],
          ReceiveThreshold[guardianThreshold],
        ),
      ).toBe(expected);
    },
  );
});

describe('actionsForStage', () => {
  it.each([
    [IncidentStage.S0, 'STOP_CONTACT'],
    [IncidentStage.S1, 'CLOSE_LINK'],
    [IncidentStage.S2, 'CHANGE_CREDENTIALS'],
    [IncidentStage.S3, 'DISCONNECT_NETWORK'],
    [IncidentStage.S4, 'CALL_112'],
  ])('returns the safety-first action for %s', (stage, expectedFirstAction) => {
    expect(actionsForStage(stage)[0]?.actionId).toBe(expectedFirstAction);
  });
});
