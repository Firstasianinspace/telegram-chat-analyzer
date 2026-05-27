import type { PhoneCall, PhoneCallRaw } from './types';

export const mapPhoneCallFromRaw = (raw: PhoneCallRaw): PhoneCall => ({
  id: raw.id,
  date: raw.date,
  dateUnixtime: raw.date_unixtime,
  actor: raw.actor,
  actorId: raw.actor_id,
  discardReason: raw.discard_reason,
  durationSeconds: raw.duration_seconds,
});

export const filterPhoneCalls = (messages: PhoneCallRaw[]): PhoneCallRaw[] =>
  messages.filter((message) => message.action === 'phone_call');
