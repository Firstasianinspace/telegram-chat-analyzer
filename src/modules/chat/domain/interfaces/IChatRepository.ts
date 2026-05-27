import type { ChatMessage, ChatParticipant, MessageType } from '../entities/types';

export type SortDirection = 'asc' | 'desc';

export type ChatNestedSortField =
  | 'file.name'
  | 'file.size'
  | 'file.mimeType'
  | 'file.duration'
  | 'file.width'
  | 'file.height'
  | 'file.stickerEmoji';

export type SortField = keyof ChatMessage | ChatNestedSortField;

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export interface MessageQueryParameters {
  offset?: number;
  limit?: number;
  type?: MessageType | MessageType[];
  fromId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  searchText?: string;
  sortBy?: SortConfig[];
  /**
   * Pre-computed total count supplied by the caller (e.g. VirtualTableDataProxy).
   * When provided, paginateCollection skips its own count() roundtrip, saving one
   * O(n) IndexedDB call per page fetch.
   */
  knownTotal?: number;
  /**
   * Keyset pagination: when provided, the repository fetches exactly these
   * primary keys via `where('id').anyOf(pageKeys)` instead of using
   * `offset(n).limit(m)`.  This makes every page fetch O(pageSize × log n)
   * regardless of page depth, eliminating the O(total) offset scan.
   *
   * Populated by VirtualTableDataProxy after it builds the seed map.
   */
  pageKeys?: number[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export interface ChatRepository {
  loadMessagesPaginated(parameters: MessageQueryParameters): Promise<PaginatedResult<ChatMessage>>;
  getMessageCount(parameters?: Omit<MessageQueryParameters, 'offset' | 'limit'>): Promise<number>;
  /**
   * Build a flat, sorted array of every matching primary key (id) for the given
   * filter params.  Keys are returned in the order implied by `params.sortBy`
   * (default: timestamp DESC).  The caller slices this array by page size to
   * get the exact key set for each page, then fetches via `anyOf`.
   *
   * This is a key-only scan — no full records are read — so it is typically
   * 10-50× faster than the equivalent `toArray()` call.
   */
  buildPageSeedMap(
    parameters: Omit<MessageQueryParameters, 'offset' | 'limit' | 'pageKeys'>,
    pageSize: number,
  ): Promise<number[]>;
  saveMessages(messages: ChatMessage[]): Promise<void>;
  saveMessagesBatched(messages: ChatMessage[], batchSize?: number, onProgress?: (progress: number) => void): Promise<void>;
  appendMessagesBatched(messages: ChatMessage[], batchSize?: number): Promise<void>;
  removeLastMessages(count: number): Promise<number>;
  loadParticipants(): Promise<ChatParticipant[]>;
  saveParticipants(participants: ChatParticipant[]): Promise<void>;
  clear(): Promise<void>;
  hasData(): Promise<boolean>;
}
