export const MESSAGE_TYPES = [
  'text',
  'sticker',
  'photo',
  'video',
  'audio',
  'voice',
  'animation',
  'service',
] as const;
export type MessageType = typeof MESSAGE_TYPES[number];

export const SERVICE_ACTIONS = [
  'phone_call',
  'chat_add_user',
  'chat_delete_user',
  'pinned_message',
  'group_created',
  'changed_title',
  'migrated_to_channel',
  'unknown',
] as const;
export type ServiceAction = typeof SERVICE_ACTIONS[number];

export function isMessageType(v: string): v is MessageType {
  return (MESSAGE_TYPES as readonly string[]).includes(v);
}

export function isServiceAction(v: string): v is ServiceAction {
  return (SERVICE_ACTIONS as readonly string[]).includes(v);
}

export interface ChatMessage {
  id: number;
  type: MessageType;
  timestamp: Date;
  editedTimestamp?: Date;
  from: string;
  fromId: string;
  text?: string;
  textEntities?: Array<{ type: string; text: string }>;
  reactions?: Array<{
    emoji: string;
    count: number;
    recent?: Array<{ from: string; fromId: string; date: Date }>;
  }>;
  file?: {
    name?: string;
    size?: number;
    mimeType?: string;
    duration?: number;
    width?: number;
    height?: number;
    thumbnail?: string;
    stickerEmoji?: string;
  };
  serviceAction?: string;
  serviceActor?: string;
  discardReason?: string;
  viaBot?: string;
}

export interface ChatParticipant {
  id: string;
  name: string;
  color?: string;
  isMe: boolean;
}

export interface MessageFilter {
  dateRange?: {
    start: Date;
    end: Date;
  };
  types?: MessageType[];
  textSearch?: string;
  minLength?: number;
  maxLength?: number;
}

