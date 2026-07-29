import { describe, expect, it } from 'vitest';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns stable service metadata', () => {
    const result = new AppController().getMetadata();

    expect(result).toEqual({
      name: 'dont-worry-api',
      status: 'ok',
      riskEngineVersion: '1.1.0',
    });
  });
});
