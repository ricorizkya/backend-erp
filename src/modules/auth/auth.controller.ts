import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Get,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, ChangePasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator';
import type { AuthenticatedUser } from './auth.types';

@SkipTenant()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ipAddress = this.getIpAddress(req);
    const userAgent = req.headers['user-agent'] ?? '';
    return this.authService.login(dto, ipAddress, userAgent);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = this.getIpAddress(req);
    const userAgent = req.headers['user-agent'] ?? '';
    return this.authService.refreshToken(
      dto.refreshToken,
      ipAddress,
      userAgent,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    // Ambil raw token dari header untuk blacklisting
    const authHeader = req.headers.authorization ?? '';
    const accessToken = authHeader.replace('Bearer ', '');
    await this.authService.logout(user.userId, user.jti, accessToken);
    return { message: 'Logout berhasil' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logoutAllDevices(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logoutAllDevices(user.userId, user.jti);
    return { message: 'Logout dari semua perangkat berhasil' };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authService.changePassword(user.userId, dto, user.jti);
    return { message: 'Password berhasil diubah. Silakan login kembali.' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return {
      userId: user.userId,
      email: user.email,
      tenantCode: user.tenantCode,
      roles: user.roles,
      permissions: user.permissions,
    };
  }

  private getIpAddress(req: Request): string {
    // Support Cloudflare + Nginx proxy headers
    const cfIp = req.headers['cf-connecting-ip'];
    const xForwarded = req.headers['x-forwarded-for'];

    if (typeof cfIp === 'string') return cfIp;
    if (typeof xForwarded === 'string') return xForwarded.split(',')[0].trim();
    return req.ip ?? '0.0.0.0';
  }
}
