/* eslint-disable unicorn/prevent-abbreviations */
import type { PhoneCall } from './types';

export interface CallsByDate {
  date: string;
  missed: number;
  hangup: number;
  totalDuration: number;
}

export interface CallsByActor {
  actor: string;
  count: number;
  totalDuration: number;
}

export interface CallsByHour {
  hour: number;
  count: number;
}

export const groupCallsByDate = (calls: PhoneCall[]): CallsByDate[] => {
  const grouped = new Map<string, CallsByDate>();

  for (const call of calls) {
    const dateParts = call.date.split('T');
    const dateOnly = dateParts[0];

    if (!dateOnly) {
      continue;
    }

    const existing = grouped.get(dateOnly);

    if (!existing) {
      grouped.set(dateOnly, {
        date: dateOnly,
        missed: call.discardReason === 'missed' ? 1 : 0,
        hangup: call.discardReason === 'hangup' ? 1 : 0,
        totalDuration: call.durationSeconds ?? 0,
      });
      continue;
    }

    if (call.discardReason === 'missed') {
      existing.missed += 1;
    }

    if (call.discardReason !== 'missed') {
      existing.hangup += 1;
    }

    existing.totalDuration += call.durationSeconds ?? 0;
  }

  return [...grouped.values()].toSorted((a, b) => a.date.localeCompare(b.date));
};

export const groupCallsByActor = (calls: PhoneCall[]): CallsByActor[] => {
  const grouped = new Map<string, CallsByActor>();

  for (const call of calls) {
    const existing = grouped.get(call.actor);

    if (!existing) {
      grouped.set(call.actor, {
        actor: call.actor,
        count: 1,
        totalDuration: call.durationSeconds ?? 0,
      });
      continue;
    }

    existing.count += 1;
    existing.totalDuration += call.durationSeconds ?? 0;
  }

  return [...grouped.values()].toSorted((a, b) => b.count - a.count);
};

export const groupCallsByHour = (calls: PhoneCall[]): CallsByHour[] => {
  const hourCounts = new Array(24).fill(0);

  for (const call of calls) {
    const timePart = call.date.split('T')[1];
    if (!timePart) continue;

    const hour = Number.parseInt(timePart.split(':')[0] ?? '0', 10);
    if (hour >= 0 && hour < 24) {
      hourCounts[hour] += 1;
    }
  }

  return hourCounts.map((count, hour) => ({ hour, count }));
};

