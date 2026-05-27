/**
 * Command Pattern (GoF) for Query Operations.
 * 
 * Encapsulates query requests as objects, enabling:
 * - Queueing of requests
 * - Logging/debugging
 * - Undo/redo potential (if needed)
 * - Decoupling invoker from receiver
 * 
 * Aligns with SOLID:
 * - Single Responsibility: Each command has one specific query operation
 * - Open/Closed: New commands can be added without modifying existing code
 */

import type { ChatMessage } from '../../domain/entities/types';
import type { MessageQueryParameters, PaginatedResult } from '../../domain/interfaces/IChatRepository';
import type { QueryStrategy } from '../strategies/QueryStrategies';

export interface QueryCommand<T> {
  execute(): Promise<T>;
  description(): string;
}

export class LoadPageCommand implements QueryCommand<PaginatedResult<ChatMessage>> {
  constructor(
    private readonly strategy: QueryStrategy,
    private readonly parameters: MessageQueryParameters
  ) { }

  async execute(): Promise<PaginatedResult<ChatMessage>> {
    return this.strategy.executeQuery(this.parameters);
  }

  description(): string {
    const { offset, limit, type, searchText } = this.parameters;
    return `LoadPage(offset=${offset}, limit=${limit}, type=${type}, search=${searchText ? 'yes' : 'no'})`;
  }

  getParams(): MessageQueryParameters {
    return this.parameters;
  }
}

export class CountMessagesCommand implements QueryCommand<number> {
  constructor(
    private readonly strategy: QueryStrategy,
    private readonly parameters: Omit<MessageQueryParameters, 'offset' | 'limit'>
  ) { }

  async execute(): Promise<number> {
    return this.strategy.executeCount(this.parameters);
  }

  description(): string {
    const { type, searchText, dateFrom, dateTo } = this.parameters;
    return `Count(type=${type}, search=${searchText ? 'yes' : 'no'}, dateRange=${dateFrom && dateTo ? 'yes' : 'no'})`;
  }

  getParams(): Omit<MessageQueryParameters, 'offset' | 'limit'> {
    return this.parameters;
  }
}
