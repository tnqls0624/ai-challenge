import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { HealthService } from './health.service';

function createPrismaStub(query: () => Promise<unknown>): PrismaService {
  return {
    $queryRaw: query,
  } as unknown as PrismaService;
}

describe('HealthService', () => {
  it('reports process liveness without touching the database', () => {
    const query = vi.fn<() => Promise<unknown>>();
    const service = new HealthService(createPrismaStub(query));

    expect(service.checkLive().status).toBe('ok');
    expect(query).not.toHaveBeenCalled();
  });

  it('reports readiness after a successful database query', async () => {
    const query = vi.fn(async () => [{ '?column?': 1 }]);
    const service = new HealthService(createPrismaStub(query));

    await expect(service.checkReady()).resolves.toMatchObject({ status: 'ok' });
    expect(query).toHaveBeenCalledOnce();
  });

  it('does not expose database errors in readiness responses', async () => {
    const service = new HealthService(
      createPrismaStub(async () => {
        throw new Error('postgresql://user:secret@example.internal/private');
      }),
    );

    const error = await service.checkReady().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(String(error)).not.toContain('secret');
  });
});
