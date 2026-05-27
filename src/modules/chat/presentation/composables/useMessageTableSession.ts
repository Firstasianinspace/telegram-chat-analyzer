import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { getColumnsForType } from '@/modules/chat/presentation/composables/tableColumns';
import {
  type ChatMessage,
  isMessageType,
  type MessageType,
} from '@/modules/chat/domain/entities/types';

export interface MessageTableSession {
  typeOptions: ComputedRef<Array<{ label: string; value: MessageType }>>;
  selectedTypes: Ref<MessageType[]>;
  allSelected: ComputedRef<boolean>;
  tableColumnsGroup: ComputedRef<'all' | 'text' | 'sticker' | 'media' | 'service'>;
  columns: ComputedRef<ColumnDef<ChatMessage, unknown>[]>;
  messageType: ComputedRef<MessageType[] | undefined>;
  pageTitle: ComputedRef<string>;
  tableKey: ComputedRef<string>;
  toggleAll: () => void;
}

function isMediaType(type: MessageType): boolean {
  return ['photo', 'video', 'audio', 'voice', 'animation'].includes(type);
}

export function useMessageTableSession(): MessageTableSession {
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n();

  function getTypesFromQuery(): MessageType[] {
    const queryType = route.query.type;
    if (
      typeof queryType !== 'string' ||
      queryType.trim() === '' ||
      queryType === 'all'
    ) {
      return [];
    }

    return queryType
      .split(',')
      .map(type => type.trim())
      .filter(type => isMessageType(type));
  }

  const selectedTypes = ref<MessageType[]>(getTypesFromQuery());

  const typeOptions = computed<Array<{ label: string; value: MessageType }>>(
    () => [
      { label: t('messages.text'), value: 'text' },
      { label: t('messages.voice'), value: 'voice' },
      { label: t('messages.video'), value: 'video' },
      { label: t('messages.photo'), value: 'photo' },
      { label: t('messages.sticker'), value: 'sticker' },
      { label: t('messages.animation'), value: 'animation' },
    ],
  );

  const allSelected = computed(() => selectedTypes.value.length === 0);

  function toggleAll(): void {
    selectedTypes.value = [];
  }

  const tableColumnsGroup = computed<
    'all' | 'text' | 'sticker' | 'media' | 'service'
  >(() => {
    if (selectedTypes.value.length !== 1) {
      return 'all';
    }

    const selectedType = selectedTypes.value[0]!;
    if (selectedType === 'text') return 'text';
    if (selectedType === 'sticker') return 'sticker';
    if (selectedType === 'service') return 'service';
    if (isMediaType(selectedType)) return 'media';

    return 'all';
  });

  const columns = computed(() => getColumnsForType(tableColumnsGroup.value));

  const messageType = computed<MessageType[] | undefined>(() => {
    return selectedTypes.value.length > 0 ? [...selectedTypes.value] : undefined;
  });

  const pageTitle = computed(() => {
    if (selectedTypes.value.length === 0) {
      return t('messages.allMessages');
    }

    if (selectedTypes.value.length === 1) {
      const selectedType = selectedTypes.value[0]!;
      return `${selectedType.charAt(0).toUpperCase()}${selectedType.slice(1)} ${t('messages.messagesSuffix')}`;
    }

    return `${selectedTypes.value
      .map(type => `${type.charAt(0).toUpperCase()}${type.slice(1)}`)
      .join(' & ')} ${t('messages.messagesSuffix')}`;
  });

  const tableKey = computed(() => {
    return [...selectedTypes.value].toSorted().join(',') || 'all';
  });

  watch(
    () => route.query,
    () => {
      selectedTypes.value = getTypesFromQuery();
    },
  );

  watch(
    selectedTypes,
    async () => {
      const query: Record<string, string> = {};
      if (selectedTypes.value.length > 0) {
        query.type = selectedTypes.value.join(',');
      }

      const currentType =
        typeof route.query.type === 'string' ? route.query.type : undefined;

      if ((query.type ?? undefined) === currentType) {
        return;
      }

      await router.replace({
        name: 'messages',
        query,
      });
    },
    { deep: true },
  );

  return {
    typeOptions,
    selectedTypes,
    allSelected,
    tableColumnsGroup,
    columns,
    messageType,
    pageTitle,
    tableKey,
    toggleAll,
  };
}