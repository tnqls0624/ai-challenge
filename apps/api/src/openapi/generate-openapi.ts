import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configureApplication } from '../bootstrap/configure-application';
import { createOpenApiDocument } from './openapi';

async function generateOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApplication(app);
  const document = createOpenApiDocument(app);
  const outputDirectory = resolve(process.cwd(), 'openapi');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, 'openapi.json'),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  await app.close();
}

void generateOpenApi();
