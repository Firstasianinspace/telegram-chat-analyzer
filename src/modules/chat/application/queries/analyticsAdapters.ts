/**
 * Chart Data Adapters (Adapter Pattern).
 * 
 * Transform domain analytics data into Chart.js compatible formats.
 * Pure functions that convert aggregated data to chart datasets.
 */

import type {
  SenderCount,
  DailyVolumePoint,
  HeatmapPoint,
  TimeSlotCount,
  BarChartData,
  LineChartData,
  ScatterChartData,
  DoughnutChartData,
} from './analyticsTypes';
import { i18n } from '@/core/config/i18n';

function t(key: string): string {
  return i18n.global.t(key) as string;
}

export const BarChartAdapter = {
  adapt(senderCounts: SenderCount[]): BarChartData {
    const labels = senderCounts.map((s) => s.senderName);
    const data = senderCounts.map((s) => s.count);

    return {
      labels,
      datasets: [
        {
          label: t('charts.messagesLabel'),
          data,
          backgroundColor: 'rgba(99, 102, 241, 0.7)',
          borderColor: 'rgba(99, 102, 241, 1)',
          borderWidth: 1,
        },
      ],
    };
  },
};

export class LineChartAdapter {
  static adapt(dailyVolume: DailyVolumePoint[]): LineChartData {
    const labels = dailyVolume.map((d) => this.formatDate(d.date));
    const data = dailyVolume.map((d) => d.count);

    return {
      labels,
      datasets: [
        {
          label: t('charts.messagesPerDay'),
          data,
          fill: true,
          borderColor: 'rgba(59, 130, 246, 1)',
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          tension: 0.4,
        },
      ],
    };
  }

  private static formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  }
}

export class ScatterChartAdapter {
  private static readonly DAY_NAMES = () => [
    t('charts.days.sun'), t('charts.days.mon'), t('charts.days.tue'),
    t('charts.days.wed'), t('charts.days.thu'), t('charts.days.fri'),
    t('charts.days.sat'),
  ];

  static adapt(heatmapPoints: HeatmapPoint[]): ScatterChartData {
    // Normalize counts to radius (1-20)
    const maxCount = Math.max(...heatmapPoints.map((p) => p.count), 1);
    const minRadius = 3;
    const maxRadius = 20;

    const data = heatmapPoints.map((p) => ({
      x: p.dayOfWeek,
      y: p.hour,
      r: minRadius + ((p.count / maxCount) * (maxRadius - minRadius)),
    }));

    // Generate colors based on count intensity
    const colors = heatmapPoints.map((p) => {
      const intensity = p.count / maxCount;
      const r = Math.floor(99 + intensity * 100);
      const g = Math.floor(102 + intensity * 50);
      const b = 241;
      return `rgba(${r}, ${g}, ${b}, ${0.6 + intensity * 0.4})`;
    });

    return {
      datasets: [
        {
          label: t('charts.messagesLabel'),
          data,
          backgroundColor: colors,
          borderColor: 'rgba(99, 102, 241, 1)',
        },
      ],
    };
  }

  /**
   * Get x-axis labels (days of week).
   */
  static getXAxisLabels(): string[] {
    return this.DAY_NAMES();
  }

  /**
   * Get y-axis labels (hours - show every 3 hours).
   */
  static getYAxisLabels(): string[] {
    return Array.from({ length: 24 }, (_, index) => `${index}:00`);
  }
}

export class DoughnutChartAdapter {
  private static readonly SLOT_LABELS: Record<TimeSlotCount['slot'], () => string> = {
    morning: () => t('charts.timeSlots.morning'),
    afternoon: () => t('charts.timeSlots.afternoon'),
    evening: () => t('charts.timeSlots.evening'),
    night: () => t('charts.timeSlots.night'),
  };

  private static readonly SLOT_COLORS: Record<TimeSlotCount['slot'], string> = {
    morning: 'rgba(251, 191, 36, 0.8)',
    afternoon: 'rgba(59, 130, 246, 0.8)',
    evening: 'rgba(168, 85, 247, 0.8)',
    night: 'rgba(99, 102, 241, 0.8)',
  };

  static adapt(timeSlots: TimeSlotCount[]): DoughnutChartData {
    const labels = timeSlots.map((ts) => this.SLOT_LABELS[ts.slot]());
    const data = timeSlots.map((t) => t.count);
    const backgroundColor = timeSlots.map((t) => this.SLOT_COLORS[t.slot]);

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor,
          borderColor: backgroundColor.map((c) => c.replace('0.8', '1')),
          borderWidth: 1,
        },
      ],
    };
  }
}
