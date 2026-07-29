import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';

export function configureApplication(app: INestApplication): void {
  const configService = app.get(ConfigService);
  app.enableCors({
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    methods: ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'],
    origin: configService.getOrThrow<string>('WEB_ORIGIN'),
  });
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
