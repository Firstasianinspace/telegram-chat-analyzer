import type { InjectionKey } from 'vue';
import type { ChatRepository } from '../domain/interfaces/IChatRepository';
import type { ChatAnalyticsRepository } from '../infrastructure/repositories/AnalyticsRepository';
import type { QueryStrategy } from './strategies/QueryStrategies';

export const CHAT_REPOSITORY_KEY: InjectionKey<ChatRepository> = Symbol('ChatRepository');
export const CHAT_ANALYTICS_REPOSITORY_KEY: InjectionKey<ChatAnalyticsRepository> = Symbol('ChatAnalyticsRepository');
export const CHAT_QUERY_STRATEGY_KEY: InjectionKey<QueryStrategy> = Symbol('ChatQueryStrategy');