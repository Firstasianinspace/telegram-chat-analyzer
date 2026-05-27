import type { ChatMessage, MessageType } from '@/modules/chat/domain/entities/types';

interface TelegramMessage {
  id: number;
  type: 'message' | 'service';
  date: string;
  date_unixtime?: number;
  edited?: string;
  from?: string;
  from_id?: string;
  text?: string | Array<{ type: string; text: string }>;
  text_entities?: Array<{ type: string; text: string }>;
  reactions?: Array<{
    emoji: string;
    count: number;
  }>;
  file?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  duration_seconds?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  sticker_emoji?: string;
  media_type?: string;
  action?: string;
  actor?: string;
  actor_id?: string;
  discard_reason?: string;
  via_bot?: string;
  photo?: string;
  video?: string;
}

interface TelegramExport {
  name?: string;
  type?: string;
  id?: number;
  messages: TelegramMessage[];
}

function determineMessageType(message: TelegramMessage): MessageType {
  if (message.type === 'service') {
    return 'service';
  }

  if (message.media_type) {
    switch (message.media_type) {
      case 'sticker': {
        return 'sticker';
      }
      case 'voice_message': {
        return 'voice';
      }
      case 'audio_file': {
        return 'audio';
      }
      case 'video_message':
      case 'video_file': {
        return 'video';
      }
      case 'animation': {
        return 'animation';
      }
      default: {
        break;
      }
    }
  }

  if (message.photo) {
    return 'photo';
  }

  if (message.text) {
    return 'text';
  }

  return 'text';
}

function extractText(text: string | Array<{ type: string; text: string }> | undefined): string | undefined {
  if (!text) return undefined;
  if (typeof text === 'string') return text;
  return text.map(entity => entity.text).join('');
}

function extractTextEntities(
  text: string | Array<{ type: string; text: string }> | undefined
): Array<{ type: string; text: string }> | undefined {
  if (!text) return undefined;
  if (typeof text === 'string') return undefined;
  return text;
}

function parseDate(dateString: string | undefined): Date {
  if (!dateString) return new Date(0);
  return new Date(dateString);
}

function mapFileInfo(telegramMessage: TelegramMessage): ChatMessage['file'] {
  const hasFileData = telegramMessage.file || telegramMessage.file_name || telegramMessage.mime_type || telegramMessage.sticker_emoji;
  if (!hasFileData) return undefined;

  const file: NonNullable<ChatMessage['file']> = {};
  if (telegramMessage.file_name !== undefined) file.name = telegramMessage.file_name;
  if (telegramMessage.file_size !== undefined) file.size = telegramMessage.file_size;
  if (telegramMessage.mime_type !== undefined) file.mimeType = telegramMessage.mime_type;
  if (telegramMessage.duration_seconds !== undefined) file.duration = telegramMessage.duration_seconds;
  if (telegramMessage.width !== undefined) file.width = telegramMessage.width;
  if (telegramMessage.height !== undefined) file.height = telegramMessage.height;
  if (telegramMessage.thumbnail !== undefined) file.thumbnail = telegramMessage.thumbnail;
  if (telegramMessage.sticker_emoji !== undefined) file.stickerEmoji = telegramMessage.sticker_emoji;
  return file;
}

export function mapTelegramMessage(telegramMessage: TelegramMessage): ChatMessage {
  const type = determineMessageType(telegramMessage);
  const text = extractText(telegramMessage.text);
  const textEntities = extractTextEntities(telegramMessage.text) || telegramMessage.text_entities;

  const message: ChatMessage = {
    id: telegramMessage.id,
    type,
    timestamp: parseDate(telegramMessage.date),
    from: telegramMessage.from || 'Unknown',
    fromId: telegramMessage.from_id || 'unknown',
  };

  if (telegramMessage.edited) {
    message.editedTimestamp = parseDate(telegramMessage.edited);
  }

  if (text) {
    message.text = text;
  }

  if (textEntities && textEntities.length > 0) {
    message.textEntities = textEntities;
  }

  if (telegramMessage.reactions && telegramMessage.reactions.length > 0) {
    message.reactions = telegramMessage.reactions.map(r => ({
      emoji: r.emoji,
      count: r.count,
    }));
  }

  const file = mapFileInfo(telegramMessage);
  if (file) {
    message.file = file;
  }

  if (type === 'service') {
    message.serviceAction = telegramMessage.action;
    message.serviceActor = telegramMessage.actor;
    message.discardReason = telegramMessage.discard_reason;
  }

  if (telegramMessage.via_bot) {
    message.viaBot = telegramMessage.via_bot;
  }

  return message;
}

export function mapTelegramExport(data: unknown): ChatMessage[] {
  if (data && typeof data === 'object' && 'messages' in data) {
    const exportData = data as TelegramExport;
    return exportData.messages.map((msg) => mapTelegramMessage(msg));
  }

  if (Array.isArray(data)) {
    return data.map((msg) => mapTelegramMessage(msg));
  }
  // @TODO: Better error handling here
  throw new Error('Invalid Telegram export format');
}
