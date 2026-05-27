// TODO: Convert to provide/inject for proper lifecycle management
/**
 * Analytics Cache Proxy (Proxy Pattern).
 * 
 * Caches analytics query results with LRU eviction.
 * Sits between commands and repository to reduce redundant computations.
 */

import type { AnalyticsCommand } from '../commands/AnalyticsCommands';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
}

export class AnalyticsCacheProxy {
  private cache = new Map<string, CacheEntry<unknown>>();
  private maxSize: number;
  private ttl: number; // Time-to-live in milliseconds

  constructor(maxSize: number = 50, ttlMinutes: number = 30) {
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000;
  }

  async execute<T>(command: AnalyticsCommand<T>): Promise<T> {
    const key = command.getCacheKey();

    // Check cache
    const cached = this.cache.get(key);
    if (cached && this.isValid(cached)) {
      cached.accessCount++;
      cached.lastAccess = Date.now();
      return cached.data as T;
    }

    // Cache miss - execute command
    const data = await command.execute();

    // Store in cache
    this.set(key, data);

    return data;
  }

  private set<T>(key: string, data: T): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccess: Date.now(),
    };

    this.cache.set(key, entry);
  }

  private isValid(entry: CacheEntry<unknown>): boolean {
    const now = Date.now();
    return now - entry.timestamp < this.ttl;
  }

  private evictLRU(): void {
    let oldestKey: string | undefined = undefined;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  invalidateByPattern(pattern: RegExp): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    let totalAccess = 0;
    for (const entry of this.cache.values()) {
      totalAccess += entry.accessCount;
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: totalAccess > 0 ? this.cache.size / totalAccess : 0,
    };
  }
}

/**
 * Singleton instance.
 */
export const analyticsCacheProxy = new AnalyticsCacheProxy();
