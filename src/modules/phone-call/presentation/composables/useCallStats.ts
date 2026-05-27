import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { ICallRepository } from '../../application/callRepository';
import {
  groupCallsByDate,
  groupCallsByActor,
  groupCallsByHour,
  type CallsByDate,
  type CallsByActor,
  type CallsByHour,
} from '../../domain/utils';

export interface UseCallStatsOptions {
  repository?: ICallRepository;
  dateRange?: { start: string; end: string };
}

export interface UseCallStatsReturn {
  callsByDate: ComputedRef<CallsByDate[]>;
  callsByActor: ComputedRef<CallsByActor[]>;
  callsByHour: ComputedRef<CallsByHour[]>;
  totalCalls: ComputedRef<number>;
  isLoading: Ref<boolean>;
  error: Ref<Error | null>;
  refetch: () => void;
}

export function useCallStats(options: UseCallStatsOptions = {}): UseCallStatsReturn {
  const { dateRange } = options;

  const getRepository = async (): Promise<ICallRepository> => {
    if (options.repository) return options.repository;
    const { indexedDBCallRepository } = await import(
      '../../infrastructure/repositories/IndexedDBCallRepository'
    );
    return indexedDBCallRepository;
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['phone-calls', dateRange?.start, dateRange?.end],
    queryFn: async () => {
      const repo = await getRepository();
      return repo.loadCalls(dateRange);
    },
    staleTime: 5 * 60 * 1000,   // 5 minutes
    gcTime: 10 * 60 * 1000,     // 10 minutes
    refetchOnWindowFocus: false,
  });

  const calls = computed(() => data.value ?? []);

  const callsByDate = computed<CallsByDate[]>(() => groupCallsByDate(calls.value));
  const callsByActor = computed<CallsByActor[]>(() => groupCallsByActor(calls.value));
  const callsByHour = computed<CallsByHour[]>(() => groupCallsByHour(calls.value));
  const totalCalls = computed<number>(() => calls.value.length);

  return {
    callsByDate,
    callsByActor,
    callsByHour,
    totalCalls,
    isLoading,
    error: error as Ref<Error | null>,
    refetch,
  };
}
