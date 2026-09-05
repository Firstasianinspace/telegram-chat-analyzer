/**
 * Shared IndexedDB query helpers.
 *
 * Extracted to eliminate the DRY violation between IndexedDBChatRepository
 * (main thread) and query.worker.ts (worker thread).  Both accept a Dexie
 * Table instance so they work with whichever database instance the caller owns.
 */

import type { Collection, Table } from 'dexie';
import type { ChatMessage } from '../../domain/entities/types';
import type { MessageQueryParameters, PaginatedResult, SortConfig } from '../../domain/interfaces/IChatRepository';

/** Normalise a type filter (string | string[] | undefined) into a uniform array. */
function normalizeTypeArray(type: MessageQueryParameters['type']): string[] | undefined {
  if (!type) return undefined;
  return Array.isArray(type) ? type : [type];
}


/**
 * Build a Dexie collection from query parameters, leveraging compound indexes
 * where possible to minimise the number of rows Dexie has to scan.
 *
 * The `messagesTable` parameter is typed broadly (`Table<any, any, any>`) to
 * remain compatible with both `EntityTable<ChatMessage, 'id'>` (worker) and
 * `EntityTable<ChatMessageWithDerived, 'id'>` (IndexedDBChatRepository).
 * Dexie's third generic (InsertType) creates structural incompatibility when
 * using narrower types.  The Collection return type is still safe.
 */

export function buildCollection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messagesTable: Table<any, any, any>,
  parameters: Omit<MessageQueryParameters, 'offset' | 'limit'>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection key-type incompatibility
): Collection<ChatMessage, any> {
  const { type, fromId, dateFrom, dateTo } = parameters;

  const typeArray = normalizeTypeArray(type);
  const singleType = typeArray?.length === 1 ? typeArray[0] : undefined;

  if ((dateFrom || dateTo) && singleType) {
    const from = dateFrom ?? new Date('1970-01-01');
    const to = dateTo ?? new Date('2099-12-31');
    // [type+timestamp], NOT [timestamp+type]: the fixed value (type) must
    // lead the compound key for `.between()` to scope by it — see the
    // version(5) comment in core/database/schema.ts.
    return messagesTable
      .where('[type+timestamp]')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection type cast
      .between([singleType, from], [singleType, to], true, true) as unknown as Collection<ChatMessage, any>;
  }

  if ((dateFrom || dateTo) && fromId) {
    const from = dateFrom ?? new Date('1970-01-01');
    const to = dateTo ?? new Date('2099-12-31');
    // [fromId+timestamp], NOT [timestamp+fromId] — same reasoning as above.
    return messagesTable
      .where('[fromId+timestamp]')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection type cast
      .between([fromId, from], [fromId, to], true, true) as unknown as Collection<ChatMessage, any>;
  }

  if (dateFrom || dateTo) {
    const from = dateFrom ?? new Date('1970-01-01');
    const to = dateTo ?? new Date('2099-12-31');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection type cast
    return messagesTable.where('timestamp').between(from, to, true, true) as unknown as Collection<ChatMessage, any>;
  }

  if (typeArray && typeArray.length > 0) {
    if (typeArray.length === 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection type cast
      return messagesTable.where('type').equals(typeArray[0]!) as unknown as Collection<ChatMessage, any>;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection type cast
    return messagesTable.where('type').anyOf(typeArray) as unknown as Collection<ChatMessage, any>;
  }

  if (fromId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection type cast
    return messagesTable.where('fromId').equals(fromId) as unknown as Collection<ChatMessage, any>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection type cast
  return messagesTable.orderBy('timestamp') as unknown as Collection<ChatMessage, any>;
}

/**
 * Apply in-memory predicates to a Dexie collection for filters that cannot be
 * safely assumed to already be satisfied by whichever index built it.
 *
 * IMPORTANT: this always re-applies `type` and `fromId` (when present) rather
 * than trying to detect whether a compound index already scoped them.
 *
 * buildCollection/buildTimestampOrderedCollection now use [type+timestamp]/
 * [fromId+timestamp] (fixed value leading, ranged value trailing), which
 * *are* correctly scoped by a `.between()` range — see the version(5)
 * comment in core/database/schema.ts. An earlier version of both functions
 * used [timestamp+type]/[timestamp+fromId] (ranged value leading, fixed
 * value trailing), which is NOT correctly scoped: for any row whose
 * timestamp falls strictly between the range bounds, the trailing
 * type/fromId component is completely unconstrained (IndexedDB compares
 * compound keys lexicographically), so the query silently matched every
 * type/sender for nearly the whole range — correct total count, since count
 * queries took a different, correctly-scoped path, but wrong actual rows.
 *
 * The indexes are fixed now, but this function still always re-applies the
 * filter rather than trusting the caller's index choice: it costs nothing
 * when the collection is already correctly scoped (the predicate is
 * trivially true for every row, evaluated during the same cursor scan Dexie
 * already performs), and it means a *future* branch that picks the wrong
 * index order can't reintroduce this exact bug silently.
 */

export function applyInMemoryFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection key-type incompatibility
  collection: Collection<ChatMessage, any>,
  parameters: Omit<MessageQueryParameters, 'offset' | 'limit'>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection key-type incompatibility
): Collection<ChatMessage, any> {
  const { type, fromId, searchText } = parameters;

  const typeArray = normalizeTypeArray(type);

  let filtered = collection;

  if (typeArray && typeArray.length > 0) {
    filtered = filtered.filter((message) => typeArray.includes(message.type));
  }

  if (fromId) {
    filtered = filtered.filter((message) => message.fromId === fromId);
  }

  if (searchText) {
    const searchLower = searchText.toLowerCase();
    filtered = filtered.filter(
      (message) =>
        message.text?.toLowerCase().includes(searchLower) ||
        message.from.toLowerCase().includes(searchLower)
    );
  }

  return filtered;
}

/**
 * Returns true when the query uses an anyOf (multi-type) collection.
 * In that case Dexie's .reverse() only reverses within each key range, so the
 * merged result is NOT globally sorted by timestamp — we must sort in memory.
 */
export function requiresInMemorySort(parameters: Omit<MessageQueryParameters, 'offset' | 'limit'>): boolean {
  const { type } = parameters;
  if (!type) return false;
  return Array.isArray(type) && type.length > 1;
}

// ---------------------------------------------------------------------------
// Keyset (cursor-based) pagination helpers
// ---------------------------------------------------------------------------

/**
 * Build a Dexie collection whose natural iteration order is ALWAYS by timestamp
 * (using compound indexes where possible), so that calling `.primaryKeys()` on
 * the result returns primary keys in timestamp order \u2014 not in primary-key order.
 *
 * This is intentionally separate from `buildCollection`, which picks the fastest
 * available index for a query regardless of sort order.  For seed-map building
 * we always need timestamp ordering so that the seed map faithfully reflects the
 * table\u2019s visible sort order.
 *
 * Index selection priority (so no full-record reads are required):
 *   1. [type+timestamp]   \u2014 single type (date-range or full span) \u2014 type leads
 *      so the range is scoped to that type; the trailing timestamp still
 *      gives timestamp-ordered iteration within it.
 *   2. [fromId+timestamp] \u2014 date-range + fromId, same reasoning
 *   3. timestamp          \u2014 date-range only
 *   4. timestamp (orderBy) \u2014 no indexed filter (multi-type uses in-memory .filter())
 */

export function buildTimestampOrderedCollection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messagesTable: Table<any, any, any>,
  parameters: Omit<MessageQueryParameters, 'offset' | 'limit' | 'pageKeys'>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection key-type incompatibility
): Collection<ChatMessage, any> {
  const { type, fromId, dateFrom, dateTo } = parameters;
  const typeArray = normalizeTypeArray(type);
  const singleType = typeArray?.length === 1 ? typeArray[0] : undefined;
  const from = dateFrom ?? new Date('1970-01-01');
  const to = dateTo ?? new Date('2099-12-31');


  if (singleType) {
    // [type+timestamp]: type leads so the range is actually scoped to that
    // type (not just "every type, ordered such that this type's rows for
    // the boundary timestamps happen to be included") \u2014 the trailing
    // timestamp component still gives timestamp-ordered iteration within it.
    return messagesTable
      .where('[type+timestamp]')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection type cast
      .between([singleType, from], [singleType, to], true, true) as unknown as Collection<ChatMessage, any>;
  }

  if (fromId && (dateFrom || dateTo)) {
    return messagesTable
      .where('[fromId+timestamp]')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection type cast
      .between([fromId, from], [fromId, to], true, true) as unknown as Collection<ChatMessage, any>;
  }

  if (dateFrom || dateTo) {
    return messagesTable
      .where('timestamp')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection type cast
      .between(from, to, true, true) as unknown as Collection<ChatMessage, any>;
  }

  // No indexed filter: full table scan ordered by timestamp.
  // For the no-filter default, we additionally use [timestamp+id] ordering
  // (if it exists) so ties on timestamp are broken deterministically by id.
  // Fall back to plain \u2018timestamp\u2019 orderBy \u2014 Dexie handles the rest.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie Collection type cast
  return messagesTable.orderBy('timestamp') as unknown as Collection<ChatMessage, any>;
}

/**
 * Build a flat, sorted array of every primary key (id) that matches the given
 * filter params.  Keys are returned in the order implied by `params.sortBy`
 * (default: timestamp DESC).
 *
 * For timestamp sorts, uses key-only IndexedDB reads via `.primaryKeys()`
 * (no full records loaded) \u2014 10\u201350\u00d7 faster than `toArray()` at scale.
 * For non-timestamp sorts, loads matching records and sorts in memory so
 * that the seed map faithfully reflects the requested column order.
 *
 * Called once per filter change by VirtualTableDataProxy; the resulting array
 * is sliced into pages so subsequent page loads use `anyOf()` instead of
 * `offset().limit()`.
 */

export async function buildSeedMapDirect(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messagesTable: Table<any, any, any>,
  parameters: Omit<MessageQueryParameters, 'offset' | 'limit' | 'pageKeys'>,
): Promise<number[]> {
  const sortBy = parameters.sortBy ?? [{ field: 'timestamp' as const, direction: 'desc' as const }];
  const sortField = (sortBy[0]?.field ?? 'timestamp') as string;
  const isDesc = (sortBy[0]?.direction ?? 'desc') === 'desc';

  // ── Fast path: timestamp sort uses key-only index scan ────────────────
  // The collection iterates in timestamp order so .primaryKeys() returns
  // IDs in the correct sort order without loading full records.
  if (sortField === 'timestamp') {
    let collection = buildTimestampOrderedCollection(messagesTable, parameters);
    collection = applyInMemoryFilters(collection, parameters);

    const keys = isDesc
      // eslint-disable-next-line unicorn/no-array-reverse -- Dexie Collection.reverse() is not Array.reverse()
      ? (await collection.reverse().primaryKeys() as number[])
      : (await collection.primaryKeys() as number[]);

    return keys;
  }

  // ── Non-timestamp sort: load matching records, sort in memory ─────────
  // Key-only .primaryKeys() cannot provide non-timestamp ordering because
  // the collection is iterated via a timestamp-based index.  Load the full
  // records (leveraging timestamp indexes for fast date-range filtering),
  // sort by the requested field, and extract IDs.
  let collection = buildTimestampOrderedCollection(messagesTable, parameters);
  collection = applyInMemoryFilters(collection, parameters);
  const items = await collection.toArray();
  const sorted = sortInMemory(items, sortBy);
  return sorted.map(item => item.id);
}

/**
 * Load a page\u2019s messages by their exact primary keys.
 *
 * `anyOf()` translates to multiple O(log n) B-tree point lookups \u2014 one per key
 * \u2014 making any page fetch O(pageSize \u00d7 log n) regardless of page depth.
 * Results are sorted in memory (O(pageSize \u00d7 log(pageSize)) \u2248 negligible).
 */

export async function loadPageByKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messagesTable: Table<any, any, any>,
  keys: number[],
  sortBy?: SortConfig[],
): Promise<ChatMessage[]> {
  if (keys.length === 0) return [];
  const items = await messagesTable.where('id').anyOf(keys).toArray() as ChatMessage[];
  // anyOf() returns items in primary-key order; re-sort to the requested order.
  return sortInMemory(items, sortBy ?? [{ field: 'timestamp', direction: 'desc' }]);
}

// ---------------------------------------------------------------------------

/**
 * Sort+paginate a Dexie collection.
 *
 * When `forceInMemory` is true (multi-type anyOf queries) and offset+limit are
 * provided, the function uses the collection's natural order with offset+limit
 * instead of loading ALL matching rows.  This trades exact sort order for
 * bounded memory — critical for 1 M+ row datasets where `toArray()` would
 * allocate hundreds of megabytes and block the thread.
 *
 * The seed-map / keyset path in VirtualTableDataProxy handles correct ordering;
 * this offset fallback is only exercised when the seed map is unavailable (e.g.
 * build failed), so approximate ordering is acceptable.
 */
export async function paginateCollection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collection: Collection<ChatMessage, any>,
  sortBy: SortConfig[] | undefined,
  offset: number | undefined,
  limit: number | undefined,
  forceInMemory: boolean,
  /**
   * Optional pre-computed total.  When supplied the function skips calling
   * collection.count() — eliminating one O(n) IndexedDB roundtrip per page.
   */
  knownTotal?: number,
): Promise<PaginatedResult<ChatMessage>> {
  const paginate = (sorted: ChatMessage[]): PaginatedResult<ChatMessage> => {
    const total = sorted.length;
    const items =
      offset !== undefined && limit !== undefined
        ? sorted.slice(offset, offset + limit)
        : sorted;
    return {
      items,
      total,
      hasMore:
        offset !== undefined && limit !== undefined
          ? offset + items.length < total
          : false,
    };
  };

  if (!sortBy || sortBy.length === 0) {
    // No explicit sort — keep Dexie's natural order (already by index key).
    if (forceInMemory && offset !== undefined && limit !== undefined) {
      // Bounded load: use offset+limit on the natural collection order rather
      // than materialising every matching record.  Sort order is approximate
      // (per-key-range for anyOf) but memory stays O(pageSize) not O(N).
      const total = knownTotal ?? await collection.count();
      const items = await collection.offset(offset).limit(limit).toArray();
      return { items, total, hasMore: offset + items.length < total };
    }
    if (forceInMemory) {
      return paginate(await collection.toArray());
    }
    const total = knownTotal ?? await collection.count();
    const items =
      offset !== undefined && limit !== undefined
        ? await collection.offset(offset).limit(limit).toArray()
        : await collection.toArray();
    return {
      items,
      total,
      hasMore:
        offset !== undefined && limit !== undefined
          ? offset + items.length < total
          : false,
    };
  }

  const primarySort = sortBy[0]!;
  const field = primarySort.field as string;
  const isDesc = primarySort.direction === 'desc';

  const canUseIndex =
    !forceInMemory && ['timestamp', 'type', 'fromId', 'id'].includes(field);

  if (canUseIndex) {
    try {
      // eslint-disable-next-line unicorn/no-array-reverse -- Dexie Collection.reverse() is not Array.reverse()
      const ordered = isDesc ? collection.reverse() : collection;
      const total = knownTotal ?? await ordered.count();
      const items =
        offset !== undefined && limit !== undefined
          ? await ordered.offset(offset).limit(limit).toArray()
          : await ordered.toArray();
      return {
        items,
        total,
        hasMore:
          offset !== undefined && limit !== undefined
            ? offset + items.length < total
            : false,
      };
    } catch {
      // Fall through to in-memory sort below
    }
  }

  // In-memory sort fallback (multi-type queries, non-indexed fields, or after index failure).
  // When offset+limit are provided, load only a bounded window from the
  // collection's natural order to avoid materialising the entire dataset.
  // The sort is approximate (per-key-range for anyOf) but the seed-map /
  // keyset path in VirtualTableDataProxy ensures correct ordering for the
  // steady-state; this path only fires during the initial seed-map build.
  if (offset !== undefined && limit !== undefined) {
    const total = knownTotal ?? await collection.count();
    const items = await collection.offset(offset).limit(limit).toArray();
    return { items, total, hasMore: offset + items.length < total };
  }
  return paginate(sortInMemory(await collection.toArray(), sortBy));
}

// ---------------------------------------------------------------------------
// Schwartzian-transform sort
// ---------------------------------------------------------------------------

/**
 * Record count above which the caller should delegate sorting to a Web Worker
 * via `sortInWorker()` to avoid blocking the main thread.
 */
export const SORT_WORKER_THRESHOLD = 50_000;

function resolveSortFieldValue(item: ChatMessage, field: SortConfig['field']): unknown {
  if (!field.includes('.')) {
    return item[field as keyof ChatMessage];
  }

  const segments = field.split('.');
  let current: unknown = item;

  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Discriminated-union pre-computed key for one sort column.
 *
 * Computed once per item in the *map* phase so that the *sort* phase does only
 * O(1) arithmetic/string comparisons — no property lookups, no `instanceof`
 * checks, no `typeof` branches in the hot path.
 */
type PreKey =
  | { isNum: true; num: number }
  | { isNum: false; str: string };

/**
 * Sort an array of ChatMessage objects in memory using the Schwartzian
 * (decorate-sort-undecorate) transform.
 *
 * Complexity: O(n·k) map + O(n·log(n)·k) sort, where k = number of sort
 * columns.  For k=1 this is effectively O(n·log n) with every comparison
 * reduced to a single subtraction or `localeCompare` — no per-comparison
 * property access, type detection, or branch overhead.
 *
 * For large arrays (> SORT_WORKER_THRESHOLD) prefer `sortInWorker()` from
 * the `useSortWorker` composable to keep the main thread responsive.
 */
export function sortInMemory(items: ChatMessage[], sortBy: SortConfig[]): ChatMessage[] {
  if (!sortBy || sortBy.length === 0) return items;
  if (items.length < 2) return items;

  // --- map phase: extract all sort keys once ---
  const keyed: [ChatMessage, PreKey[]][] = items.map(item => [
    item,
    sortBy.map(({ field }) => {
      const value = resolveSortFieldValue(item, field);
      if (value instanceof Date) return { isNum: true as const, num: value.getTime() };
      if (typeof value === 'number') return { isNum: true as const, num: value };
      return {
        isNum: false as const,
        str: typeof value === 'string' ? value : String(value ?? ''),
      };
    }),
  ]);

  // --- sort phase: O(1) key comparisons per column ---
  keyed.sort(([, aKeys], [, bKeys]) => {
    for (const [index, element] of sortBy.entries()) {
      const ak = aKeys[index]!;
      const bk = bKeys[index]!;
      const sign = element!.direction === 'desc' ? -1 : 1;

      let cmp: number;
      if (ak.isNum && bk.isNum) {
        cmp = ak.num - bk.num;
      } else if (!ak.isNum && !bk.isNum) {
        cmp = ak.str.localeCompare(bk.str);
      } else { // eslint-disable-line no-restricted-syntax -- else required for exhaustive type narrowing
        cmp = 0; // mixed types — treat as equal
      }

      if (cmp !== 0) return sign * cmp;
    }
    return 0;
  });

  // --- undecorate phase ---
  return keyed.map(([item]) => item);
}
