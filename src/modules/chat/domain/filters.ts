/**
 * Pure domain functions for filtering chat messages in-memory.
 *
 * These are the client-side fallback for when DB-level filtering is unavailable
 * (e.g. exotic filter combinations not covered by IndexedDB indexes).
 * For the default guest flow the app relies on IndexedDB-level filtering;
 * these functions are the safety net and can be unit-tested independently.
 */

import type { ChatMessage, MessageFilter } from './entities/types';

export function filterByDateRange(
  messages: ChatMessage[],
  start: Date,
  end: Date
): ChatMessage[] {
  return messages.filter(message => {
    return message.timestamp >= start && message.timestamp <= end;
  });
}

export function filterByTextSearch(
  messages: ChatMessage[],
  searchText: string
): ChatMessage[] {
  if (!searchText.trim()) return messages;

  const lowerSearch = searchText.toLowerCase();

  // Check for negation (starts with minus)
  const isNegation = lowerSearch.startsWith('-');
  const actualSearch = isNegation ? lowerSearch.slice(1).trim() : lowerSearch;

  return messages.filter(message => {
    const messageText = message.text?.toLowerCase() || '';
    const matches = messageText.includes(actualSearch);
    return isNegation ? !matches : matches;
  });
}

/**
 * Filter messages by minimum text length.
 */
export function filterByMinLength(
  messages: ChatMessage[],
  minLength: number
): ChatMessage[] {
  return messages.filter(message => {
    const length = message.text?.length || 0;
    return length >= minLength;
  });
}

/**
 * Filter messages by maximum text length.
 */
export function filterByMaxLength(
  messages: ChatMessage[],
  maxLength: number
): ChatMessage[] {
  return messages.filter(message => {
    const length = message.text?.length || 0;
    return length <= maxLength;
  });
}

/**
 * Apply all filters from MessageFilter to messages in a single pass.
 * O(n) — each message is evaluated against all active predicates once,
 * avoiding the multiple intermediate arrays of a chained approach.
 */
export function applyFilters(
  messages: ChatMessage[],
  filter: MessageFilter
): ChatMessage[] {
  // Build predicate list up-front so no branch-testing per-message
  const predicates: Array<(message: ChatMessage) => boolean> = [];

  if (filter.dateRange) {
    const { start, end } = filter.dateRange;
    predicates.push((message) => message.timestamp >= start && message.timestamp <= end);
  }

  if (filter.types && filter.types.length > 0) {
    const types = filter.types;
    predicates.push((message) => types.includes(message.type));
  }

  if (filter.textSearch) {
    const lowerSearch = filter.textSearch.toLowerCase();
    const isNegation = lowerSearch.startsWith('-');
    const actualSearch = isNegation ? lowerSearch.slice(1).trim() : lowerSearch;
    predicates.push((message) => {
      const matches = (message.text?.toLowerCase() ?? '').includes(actualSearch);
      return isNegation ? !matches : matches;
    });
  }

  if (filter.minLength !== undefined) {
    const min = filter.minLength;
    predicates.push((message) => (message.text?.length ?? 0) >= min);
  }

  if (filter.maxLength !== undefined) {
    const max = filter.maxLength;
    predicates.push((message) => (message.text?.length ?? 0) <= max);
  }

  if (predicates.length === 0) return messages;

  return messages.filter((message) => predicates.every((function_) => function_(message)));
}
