import { defineStore } from 'pinia';
import { shallowRef, ref, computed, markRaw, inject } from 'vue';
import type { ChatRepository, MessageQueryParameters } from '../../domain/interfaces/IChatRepository';
import type { ChatMessage, ChatParticipant, MessageType } from '../../domain/entities/types';
import { CHAT_REPOSITORY_KEY } from '../../application/chatRepositorySymbol';

/** Per-type message counts stored at save time — never requires loading messages into memory. */
type TypeCounts = Record<MessageType, number>;

const EMPTY_TYPE_COUNTS: TypeCounts = {
  text: 0, sticker: 0, photo: 0, video: 0,
  audio: 0, voice: 0, animation: 0, service: 0,
};

export const useChatStore = defineStore('chat', () => {
  const injected = inject(CHAT_REPOSITORY_KEY);
  if (!injected) {
    throw new Error('[useChatStore] ChatRepository not provided. Call app.provide(CHAT_REPOSITORY_KEY, impl) before creating this store.');
  }

  const participants = shallowRef<ChatParticipant[]>([]);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const saveProgress = ref(0);
  const error = ref<string | undefined>();
  const repository = ref<ChatRepository>(injected);

  const totalCount = ref(0);

  const typeCounts = ref<TypeCounts>({ ...EMPTY_TYPE_COUNTS });

  const hasData = computed(() => totalCount.value > 0);

  const stats = computed(() => ({
    total: totalCount.value,
    text: typeCounts.value.text,
    stickers: typeCounts.value.sticker,
    photos: typeCounts.value.photo,
    videos: typeCounts.value.video + typeCounts.value.animation,
    audio: typeCounts.value.audio + typeCounts.value.voice,
    service: typeCounts.value.service,
  }));

  async function getMessageCount(parameters?: Omit<MessageQueryParameters, 'offset' | 'limit'>): Promise<number> {
    try {
      return await repository.value.getMessageCount(parameters);
    } catch (error_) {
      error.value = error_ instanceof Error ? error_.message : 'Failed to get message count';
      return 0;
    }
  }

  async function saveMessagesBatched(newMessages: ChatMessage[]): Promise<void> {
    isSaving.value = true;
    saveProgress.value = 0;
    error.value = undefined;

    try {
      await repository.value.saveMessagesBatched(newMessages, 1000, (progress) => {
        saveProgress.value = progress;
      });

      const participantsMap = new Map<string, ChatParticipant>();
      const counts: TypeCounts = { ...EMPTY_TYPE_COUNTS };

      for (const message of newMessages) {
        if (!message) continue;

        counts[message.type]++;

        if (!participantsMap.has(message.fromId)) {
          participantsMap.set(message.fromId, {
            id: message.fromId,
            name: message.from,
            isMe: false,
          });
        }
      }

      const extractedParticipants = [...participantsMap.values()];
      await repository.value.saveParticipants(extractedParticipants);

      totalCount.value = newMessages.length;
      typeCounts.value = counts;
      participants.value = extractedParticipants.map(p => markRaw(p));
    } catch (error_) {
      error.value = error_ instanceof Error ? error_.message : 'Failed to save messages';
      throw error_;
    } finally {
      isSaving.value = false;
      saveProgress.value = 0;
    }
  }

  async function clearData(): Promise<void> {
    isLoading.value = true;
    error.value = undefined;

    try {
      await repository.value.clear();
      participants.value = [];
      totalCount.value = 0;
      typeCounts.value = { ...EMPTY_TYPE_COUNTS };
    } catch (error_) {
      error.value = error_ instanceof Error ? error_.message : 'Failed to clear data';
      throw error_;
    } finally {
      isLoading.value = false;
    }
  }

  async function appendMessages(newMessages: ChatMessage[]): Promise<void> {
    if (newMessages.length === 0) return;
    try {
      await repository.value.appendMessagesBatched(newMessages, 1000);

      const counts: TypeCounts = { ...EMPTY_TYPE_COUNTS };
      const participantsMap = new Map<string, ChatParticipant>();

      for (const message of newMessages) {
        counts[message.type]++;
        if (!participantsMap.has(message.fromId)) {
          participantsMap.set(message.fromId, { id: message.fromId, name: message.from, isMe: false });
        }
      }

      totalCount.value += newMessages.length;
      for (const key of Object.keys(counts) as (keyof TypeCounts)[]) {
        typeCounts.value[key] = (typeCounts.value[key] ?? 0) + counts[key];
      }

      const existingIds = new Set(participants.value.map(p => p.id));
      const fresh = [...participantsMap.values()].filter(p => !existingIds.has(p.id));
      if (fresh.length > 0) {
        const merged = [...participants.value, ...fresh.map(p => markRaw(p))];
        participants.value = merged;
        await repository.value.saveParticipants(merged);
      }
    } catch (error_) {
      error.value = error_ instanceof Error ? error_.message : 'Failed to append messages';
      throw error_;
    }
  }

  async function removeLastMessages(count: number): Promise<void> {
    try {
      const removed = await repository.value.removeLastMessages(count);
      totalCount.value = Math.max(0, totalCount.value - removed);
      if (totalCount.value === 0) {
        typeCounts.value = { ...EMPTY_TYPE_COUNTS };
        participants.value = [];
        return;
      }

      await checkHasData();
    } catch (error_) {
      error.value = error_ instanceof Error ? error_.message : 'Failed to remove messages';
      throw error_;
    }
  }

  async function checkHasData(): Promise<boolean> {
    try {
      const hasAnyData = await repository.value.hasData();
      if (hasAnyData && totalCount.value === 0) {
        totalCount.value = await repository.value.getMessageCount();
      }
      return hasAnyData;
    } catch (error_) {
      error.value = error_ instanceof Error ? error_.message : 'Failed to check data';
      return false;
    }
  }

  function setRepository(newRepository: ChatRepository): void {
    repository.value = newRepository;
  }

  return {
    participants,
    isLoading,
    isSaving,
    saveProgress,
    error,
    totalCount,
    repository,

    hasData,
    stats,

    getMessageCount,
    saveMessagesBatched,
    appendMessages,
    removeLastMessages,
    clearData,
    checkHasData,
    setRepository,
  };
});
