import type { PhoneCall } from '../domain/types';

export interface ICallRepository {
  loadCalls(dateRange?: { start: string; end: string }): Promise<PhoneCall[]>;
  getCallCount(): Promise<number>;
}
