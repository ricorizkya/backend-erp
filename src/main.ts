import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const isProd = config.get('NODE_ENV') === 'production';

  // ----------------------------------------------------------------
  // SECURITY HEADERS (Helmet)
  // ----------------------------------------------------------------
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  });

  // ----------------------------------------------------------------
  // CORS
  // ----------------------------------------------------------------
  const allowedOrigins = config
    .get<string>('ALLOWED_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());

  await app.register(fastifyCors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // ----------------------------------------------------------------
  // GLOBAL RATE LIMITING
  // Limit kasar di level app — rate limiting per-endpoint
  // yang lebih granular dihandle di AuthService (Redis)
  // ----------------------------------------------------------------
  await app.register(fastifyRateLimit, {
    max: 300, // 300 request per menit per IP
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      message: 'Terlalu banyak request. Coba lagi dalam 1 menit.',
    }),
  });

  // ----------------------------------------------------------------
  // GLOBAL PIPES — validasi semua incoming request body
  // ----------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properti yang tidak ada di DTO
      forbidNonWhitelisted: true, // throw error jika ada properti tak dikenal
      transform: true, // auto-transform ke tipe DTO (string → number, dll)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ----------------------------------------------------------------
  // GLOBAL EXCEPTION FILTER
  // ----------------------------------------------------------------
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ----------------------------------------------------------------
  // GLOBAL PREFIX
  // ----------------------------------------------------------------
  app.setGlobalPrefix('api/v1');

  await app.listen(port, '0.0.0.0');
  console.log(`ERP API running on port ${port}`);
}

bootstrap();
