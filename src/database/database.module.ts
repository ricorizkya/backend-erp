import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DatabaseService } from './database.service';
import { MigrationService } from './migration.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    // Pool disediakan sebagai provider terpisah
    // agar bisa di-inject langsung oleh MigrationService
    {
      provide: Pool,
      useFactory: (config: ConfigService) =>
        new Pool({
          host: config.getOrThrow<string>('DB_HOST'),
          port: config.getOrThrow<number>('DB_PORT'),
          database: config.getOrThrow<string>('DB_NAME'),
          user: config.getOrThrow<string>('DB_USER'),
          password: config.getOrThrow<string>('DB_PASSWORD'),
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 3000,
        }),
      inject: [ConfigService],
    },
    DatabaseService,
    MigrationService,
  ],
  exports: [DatabaseService, MigrationService],
})
export class DatabaseModule {}
