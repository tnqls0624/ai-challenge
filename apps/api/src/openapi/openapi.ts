import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

const openApiConfig = new DocumentBuilder()
  .setTitle('돈워리 API')
  .setDescription('고령자 금융 안전 공동대응 MVP API')
  .setVersion('0.1.0')
  .addBearerAuth()
  .addBearerAuth(
    {
      bearerFormat: 'opaque',
      scheme: 'bearer',
      type: 'http',
    },
    'deviceCredential',
  )
  .build();

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, openApiConfig);
}

export function setupOpenApi(app: INestApplication): void {
  SwaggerModule.setup('docs', app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: 'openapi.json',
  });
}
