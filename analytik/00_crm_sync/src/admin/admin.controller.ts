import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { PatchAccountDto } from './dto/patch-account.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/guards/roles.decorator';
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private svc: AdminService) {}
  @Get('accounts') list() { return this.svc.listAccounts(); }
  @Post('accounts') create(@Body() dto: CreateAccountDto) { return this.svc.createAccount(dto); }
  @Patch('accounts/:accountId') patch(@Param('accountId', ParseIntPipe) id: number, @Body() dto: PatchAccountDto) { return this.svc.patchAccount(id, dto); }
  @Delete('accounts/:accountId') del(@Param('accountId', ParseIntPipe) id: number) { return this.svc.deleteAccount(id); }
  @Post('accounts/:accountId/retry-backfill') retry(@Param('accountId', ParseIntPipe) id: number) { return this.svc.retryBackfill(id); }
  @Post('accounts/:accountId/stop-sync') stopSync(@Param('accountId', ParseIntPipe) id: number) { return this.svc.stopSync(id); }
  @Post('accounts/:accountId/start-sync') startSync(@Param('accountId', ParseIntPipe) id: number) { return this.svc.startSync(id); }
  @Post('accounts/:accountId/enrich') enrich(@Param('accountId', ParseIntPipe) id: number) { return this.svc.enrichAccount(id); }
  @Get('accounts/:accountId/ai-settings') getAiSettings(@Param('accountId', ParseIntPipe) id: number) { return this.svc.getAiSettings(id); }
  @Patch('accounts/:accountId/ai-settings') updateAiSettings(@Param('accountId', ParseIntPipe) id: number, @Body() dto: UpdateAiSettingsDto) { return this.svc.updateAiSettings(id, dto); }
  @Get('notifications') listNotif(@Query('unreadOnly') unread: string) { return this.svc.listNotifications(unread === 'true'); }
  @Post('notifications/:id/read') readNotif(@Param('id', ParseIntPipe) id: number) { return this.svc.markNotificationRead(id); }
  @Post('ai/test') testAi(@Body() body: { model: string; token: string }) { return this.svc.testAiConnection(body.model, body.token); }
}

