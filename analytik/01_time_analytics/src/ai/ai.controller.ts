import { Controller, Get, Post, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiChatDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountOwnershipGuard } from '../user/guards/ownership.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/guards/roles.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('accounts/:accountId/ai/status')
  @UseGuards(AccountOwnershipGuard)
  async getAiStatus(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.aiService.getAiStatus(accountId);
  }

  @Post('accounts/:accountId/ai/chat')
  @UseGuards(AccountOwnershipGuard)
  async chat(
    @Param('accountId', ParseIntPipe) accountId: number,
    @Body() dto: AiChatDto,
  ) {
    return this.aiService.chat(accountId, dto);
  }

  @Post('admin/ai/test')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async testConnection(@Body() body: { model: string; token: string }) {
    return this.aiService.testConnection(body.model, body.token);
  }
}

