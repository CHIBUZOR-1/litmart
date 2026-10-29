// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from './app.module.js';
import cookieParser from "cookie-parser";
import helmet from "helmet";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
    // Security headers
  app.use(helmet());

  // Cookies
  app.use(cookieParser());
  // DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // CORS
  app.enableCors({
    origin: [process.env.ORIGIN, process.env.ORIGIN1],
    credentials: true,
  });
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3002);
}
await bootstrap();
 