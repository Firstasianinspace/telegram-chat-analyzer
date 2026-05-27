/**
 * Analytics Query Commands (Command Pattern).
 * 
 * Each command encapsulates a specific analytics query operation.
 * Commands can be executed synchronously or via a query strategy (worker).
 */
import type {
  AnalyticsFilter,
  DateRange,
  SenderCount,
  DailyVolumePoint,
  HeatmapPoint,
  TimeSlotCount,
} from '../queries/analyticsTypes';
import type { ChatAnalyticsRepository } from '../../infrastructure/repositories/AnalyticsRepository';

export interface AnalyticsCommand<T> {
  execute(): Promise<T>;
  getCacheKey(): string;
}

export class GetTotalMessagesPerSenderCommand implements AnalyticsCommand<SenderCount[]> {
  constructor(
    private repository: ChatAnalyticsRepository,
    private filter?: AnalyticsFilter,
    private limit: number = 20
  ) { }

  async execute(): Promise<SenderCount[]> {
    return this.repository.getTotalMessagesPerSender(this.filter, this.limit);
  }

  getCacheKey(): string {
    return `senders:${JSON.stringify(this.filter)}:${this.limit}`;
  }
}

export class GetDailyVolumeCommand implements AnalyticsCommand<DailyVolumePoint[]> {
  constructor(
    private repository: ChatAnalyticsRepository,
    private dateRange?: DateRange
  ) { }

  async execute(): Promise<DailyVolumePoint[]> {
    return this.repository.getDailyVolume(this.dateRange);
  }

  getCacheKey(): string {
    return `daily:${JSON.stringify(this.dateRange)}`;
  }
}

export class GetWeeklyActivityHeatmapCommand implements AnalyticsCommand<HeatmapPoint[]> {
  constructor(
    private repository: ChatAnalyticsRepository,
    private dateRange?: DateRange
  ) { }

  async execute(): Promise<HeatmapPoint[]> {
    return this.repository.getWeeklyActivityHeatmap(this.dateRange);
  }

  getCacheKey(): string {
    return `heatmap:${JSON.stringify(this.dateRange)}`;
  }
}

export class GetTimeOfDayDistributionCommand implements AnalyticsCommand<TimeSlotCount[]> {
  constructor(
    private repository: ChatAnalyticsRepository,
    private dateRange?: DateRange
  ) { }

  async execute(): Promise<TimeSlotCount[]> {
    return this.repository.getTimeOfDayDistribution(this.dateRange);
  }

  getCacheKey(): string {
    return `timeofday:${JSON.stringify(this.dateRange)}`;
  }
}
