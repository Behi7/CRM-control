import { Controller, Get, Param, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountOwnershipGuard } from './guards/ownership.guard';
import { ParseTagIdsPipe } from './dto/parse-tag-ids.pipe';
function parseIntIds(val: string | undefined): number[] {
  if (!val) return [];
  return val.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
}

@Controller()
@UseGuards(JwtAuthGuard, AccountOwnershipGuard)
export class UserController {
  constructor(private svc: UserService) {}
  @Get('accounts/:accountId/pipelines') getPipelines(@Param('accountId', ParseIntPipe) id: number) { return this.svc.getPipelines(id); }
  @Get('accounts/:accountId/tags') getTags(@Param('accountId', ParseIntPipe) id: number) { return this.svc.getTags(id); }
  @Get('accounts/:accountId/managers') getManagers(@Param('accountId', ParseIntPipe) id: number) { return this.svc.getManagers(id); }
  @Get('pipelines/:pipelineId/stages-stats') getStats(
    @Param('pipelineId', ParseIntPipe) id: number,
    @Query('tagIds', ParseTagIdsPipe) tagIds: number[],
    @Query('status') status?: string,
    @Query('managerIds') managerIds?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) { return this.svc.getStagesStats(id, tagIds, status, parseIntIds(managerIds), dateFrom, dateTo); }
  @Get('stages/:stageId/active-leads') active(
    @Param('stageId', ParseIntPipe) id: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(50), ParseIntPipe) perPage: number,
    @Query('tagIds', ParseTagIdsPipe) tagIds: number[],
    @Query('status') status?: string,
    @Query('managerIds') managerIds?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) { return this.svc.getActiveLeads(id, page, perPage, tagIds, status, parseIntIds(managerIds), dateFrom, dateTo); }
  @Get('leads/:leadId/history') history(@Param('leadId', ParseIntPipe) id: number) { return this.svc.getLeadHistory(id); }
  @Get('accounts/:accountId/leads/search') search(
    @Param('accountId', ParseIntPipe) id: number,
    @Query('q') q: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(50), ParseIntPipe) perPage: number,
    @Query('tagIds', ParseTagIdsPipe) tagIds: number[],
    @Query('status') status?: string,
    @Query('managerIds') managerIds?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) { return this.svc.searchLeads(id, q || '', page, perPage, tagIds, status, parseIntIds(managerIds), dateFrom, dateTo); }
  @Get('accounts/:accountId/leads') byStatus(
    @Param('accountId', ParseIntPipe) id: number,
    @Query('status') status: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(50), ParseIntPipe) perPage: number,
    @Query('tagIds', ParseTagIdsPipe) tagIds: number[],
    @Query('managerIds') managerIds?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) { return this.svc.listLeadsByStatus(id, status || 'open', page, perPage, tagIds, parseIntIds(managerIds), dateFrom, dateTo); }
}
