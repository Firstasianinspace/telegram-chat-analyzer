import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { database as chatDatabase } from '@/core/database/schema';

export interface SenderOption {
  value: string;
  label: string;
}

async function fetchUniqueSenders(): Promise<SenderOption[]> {
  try {
    const rows = await chatDatabase.senderTotalCounts.toArray();

    const options: SenderOption[] = rows
      .map((row) => ({
        value: row.fromId,
        label: row.senderName || row.fromId,
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label));

    return options;
  } catch (error) {
    console.error('[useSenderList] Failed to fetch senders:', error);
    return [];
  }
}

export function useSenderList() {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['senders', 'unique'],
    queryFn: fetchUniqueSenders,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: false,
  });

  const senders = computed(() => data.value ?? []);

  return {
    senders,
    isLoading,
    error,
    refetch,
  };
}
