import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(private readonly db: DatabaseService) {}

  // Jalankan setiap hari jam 02:00 pagi
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const result = await this.db
        .getPublicDb()
        .deleteFrom('refresh_tokens')
        .where((eb) =>
          eb.or([
            eb('expires_at', '<', new Date()),
            eb('is_revoked', '=', true),
          ]),
        )
        .executeTakeFirst();

      this.logger.log(`Token cleanup: ${result.numDeletedRows} token dihapus`);
    } catch (error) {
      this.logger.error('Token cleanup gagal', error);
    }
  }
}
