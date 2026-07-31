import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RedisModule } from '@nestjs-modules/ioredis';
import { DatabaseModule } from './database/database.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { HashIdInterceptor } from './common/hashid/hashid.interceptor';
import { HashIdDecodeInterceptor } from './common/hashid/hashid-decode.interceptor';
import { HashIdModule } from './common/hashid/hashid.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProductModule } from './modules/product/product.module';
import { PurchaseOrderModule } from './modules/purchase-order/purchase-order.module';
import { SalesOrderModule } from './modules/sales-order/sales-order.module';
import { BomModule } from './modules/bom/bom.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
    }),
    RedisModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url: config.getOrThrow('REDIS_URL'),
        options: { retryStrategy: (t: number) => Math.min(t * 50, 2000) },
      }),
      inject: [ConfigService],
      imports: [ConfigModule],
    }),
    DatabaseModule,
    CommonModule,
    HashIdModule,
    AuthModule,
    ProductModule,
    InventoryModule,
    PurchaseOrderModule,
    SalesOrderModule,
    BomModule,
    // ProductionModule,
    // QualityControlModule,
    // AccountingModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HashIdDecodeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HashIdInterceptor },
  ],
})
export class AppModule {}
