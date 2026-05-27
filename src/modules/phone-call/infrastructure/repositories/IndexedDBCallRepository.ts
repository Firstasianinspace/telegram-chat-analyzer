/* eslint-disable unicorn/filename-case */
import { database as chatDatabase } from '@/core/database/schema';
import type { ICallRepository } from '../../application/callRepository';
import type { PhoneCall } from '../../domain/types';

/**
 * IndexedDB implementation of ICallRepository.
 *
 * Phone calls are stored in the main messages table as `type = 'service'`
 * with `serviceAction = 'phone_call'`.  This implementation queries that
 * table directly using the `serviceAction` + `date` indexes, so it never
 * loads non-call service messages into memory.
 */
export class IndexedDBCallRepository implements ICallRepository {
  async loadCalls(dateRange?: { start: string; end: string }): Promise<PhoneCall[]> {
    // `type` is indexed; `serviceAction` is not — filter in-memory after the
    // indexed scan.  Service messages are a tiny fraction of total messages so
    // the in-memory step is cheap.
    let collection = chatDatabase.messages
      .where('type')
      .equals('service')
      .filter((message) => message.serviceAction === 'phone_call');

    if (dateRange) {
      collection = collection.filter(
        (message) => message.date >= dateRange.start && message.date <= dateRange.end
      );
    }

    const messages = await collection.toArray();

    return messages.map((message): PhoneCall => ({
      id: message.id,
      date: message.timestamp.toISOString(),
      dateUnixtime: Math.floor(message.timestamp.getTime() / 1000).toString(),
      actor: message.from,
      actorId: message.fromId,
      discardReason: (message.discardReason as PhoneCall['discardReason']) ?? 'hangup',
      durationSeconds: message.file?.duration,
    }));
  }

  async getCallCount(): Promise<number> {
    return chatDatabase.messages
      .where('type')
      .equals('service')
      .filter((message) => message.serviceAction === 'phone_call')
      .count();
  }
}

export const indexedDBCallRepository = new IndexedDBCallRepository();
