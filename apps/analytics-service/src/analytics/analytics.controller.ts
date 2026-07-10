import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  summary() {
    return this.analyticsService.summary();
  }

  @Get('orders-per-hour')
  ordersPerHour(@Query('hours', new ParseIntPipe({ optional: true })) hours?: number) {
    return this.analyticsService.ordersPerHour(hours);
  }

  @Get('time-in-status')
  timeInStatus() {
    return this.analyticsService.averageTimeInStatus();
  }
}
