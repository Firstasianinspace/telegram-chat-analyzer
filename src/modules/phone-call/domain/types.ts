export interface PhoneCall {
  id: number;
  date: string;
  dateUnixtime: string;
  actor: string;
  actorId: string;
  discardReason: 'hangup' | 'missed' | 'disconnect';
  durationSeconds?: number;
}

export interface PhoneCallRaw {
  id: number;
  type: string;
  date: string;
  date_unixtime: string;
  actor: string;
  actor_id: string;
  action: string;
  discard_reason: 'hangup' | 'missed' | 'disconnect';
  duration_seconds?: number;
  text: string;
  text_entities: unknown[];
}

export interface TelegramExport {
  name: string;
  type: string;
  id: number;
  messages: PhoneCallRaw[];
}
