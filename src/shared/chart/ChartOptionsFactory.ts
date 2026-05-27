import type { ChartOptions } from 'chart.js';
import { i18n } from '@/core/config/i18n';

function t(key: string): string {
  return i18n.global.t(key) as string;
}

/**
 * Factory for creating Chart.js options.
 */
export class ChartOptionsFactory {
  private static getBaseOptions(): Partial<ChartOptions> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12,
              family: "'Inter', sans-serif",
            },
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: {
            size: 13,
            family: "'Inter', sans-serif",
          },
          bodyFont: {
            size: 12,
            family: "'Inter', sans-serif",
          },
          padding: 12,
          cornerRadius: 8,
        },
      },
    };
  }

  static createBarOptions(): ChartOptions<'bar'> {
    return {
      ...this.getBaseOptions(),
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            font: {
              size: 11,
            },
            maxRotation: 45,
            minRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
          },
          ticks: {
            font: {
              size: 11,
            },
          },
        },
      },
      plugins: {
        ...this.getBaseOptions().plugins,
        tooltip: {
          ...this.getBaseOptions().plugins?.tooltip,
          callbacks: {
            label: (context) => {
              return `${t('charts.messagesLabel')}: ${(context.parsed.y ?? 0).toLocaleString()}`;
            },
          },
        },
      },
    } as ChartOptions<'bar'>;
  }

  static createLineOptions(): ChartOptions<'line'> {
    return {
      ...this.getBaseOptions(),
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            font: {
              size: 11,
            },
            maxRotation: 45,
            minRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
          },
          ticks: {
            font: {
              size: 11,
            },
          },
        },
      },
      plugins: {
        ...this.getBaseOptions().plugins,
        tooltip: {
          ...this.getBaseOptions().plugins?.tooltip,
          callbacks: {
            label: (context) => {
              return `${t('charts.messagesLabel')}: ${(context.parsed.y ?? 0).toLocaleString()}`;
            },
          },
        },
      },
    } as ChartOptions<'line'>;
  }

  static createScatterOptions(): ChartOptions<'scatter'> {
    return {
      ...this.getBaseOptions(),
      scales: {
        x: {
          type: 'linear',
          min: -0.5,
          max: 6.5,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
          },
          afterBuildTicks: (axis) => {
            // Force ticks at 0, 1, 2, 3, 4, 5, 6
            axis.ticks = [0, 1, 2, 3, 4, 5, 6].map((v) => ({ value: v }));
          },
          ticks: {
            font: {
              size: 11,
            },
            callback: function (value) {
              const days = [
                t('charts.days.sun'), t('charts.days.mon'), t('charts.days.tue'),
                t('charts.days.wed'), t('charts.days.thu'), t('charts.days.fri'),
                t('charts.days.sat'),
              ];
              return days[value as number] || '';
            },
          },
          title: {
            display: true,
            text: t('charts.dayOfWeek'),
            color: '#666',
            font: {
              size: 14,
              weight: 600,
            },
          },
        },
        y: {
          type: 'linear',
          min: -0.5,
          max: 23.5,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
          },
          afterBuildTicks: (axis) => {
            // Force ticks at 0, 3, 6, 9, 12, 15, 18, 21
            axis.ticks = [0, 3, 6, 9, 12, 15, 18, 21].map((v) => ({ value: v }));
          },
          ticks: {
            font: {
              size: 11,
            },
            callback: function (value) {
              return `${value}:00`;
            },
          },
          title: {
            display: true,
            text: t('charts.hourOfDay'),
            color: '#666',
            font: {
              size: 14,
              weight: 600,
            },
          },
        },
      },
      plugins: {
        ...this.getBaseOptions().plugins,
        legend: {
          display: false,
        },
        tooltip: {
          ...this.getBaseOptions().plugins?.tooltip,
          callbacks: {
            title: (context) => {
              const days = [
                t('charts.daysFull.sunday'), t('charts.daysFull.monday'), t('charts.daysFull.tuesday'),
                t('charts.daysFull.wednesday'), t('charts.daysFull.thursday'), t('charts.daysFull.friday'),
                t('charts.daysFull.saturday'),
              ];
              const point = context[0];
              if (!point) return '';
              const x = point.parsed.x ?? 0;
              const day = days[x] ?? t('charts.daysFull.unknown');
              const hour = point.parsed.y ?? 0;
              return `${day}${t('charts.at')}${hour}:00`;
            },
            label: (context) => {
              const raw = context.raw as Record<string, number> | undefined;
              return `${t('charts.messagesLabel')}: ${Math.round((raw?.r ?? 0) * 5)}`;
            },
          },
        },
      },
    } as ChartOptions<'scatter'>;
  }

  static createDoughnutOptions(): ChartOptions<'doughnut'> {
    return {
      ...this.getBaseOptions(),
      plugins: {
        ...this.getBaseOptions().plugins,
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 20,
            font: {
              size: 12,
              family: "'Inter', sans-serif",
            },
          },
        },
        tooltip: {
          ...this.getBaseOptions().plugins?.tooltip,
          callbacks: {
            label: (context) => {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value.toLocaleString()} (${percentage}%)`;
            },
          },
        },
      },
    } as ChartOptions<'doughnut'>;
  }
}
