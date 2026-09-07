import { config } from '../config.js';

export interface EmbeddingCacheEntry {
  status: number;
  body: unknown;
  createdAt: number;
  expiresAt: number;
}

const cache = new Map<string, EmbeddingCacheEntry>();
let hits = 0;
let misses = 0;
let stores = 0;
let evictions = 0;

export function buildEmbeddingCacheKey(model: string, input: string): string {
  return `${model}\u0000${input}`;
}

export function getCachedEmbedding(key: string): EmbeddingCacheEntry | null {
  if (!config.embeddingCacheEnabled) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    misses += 1;
    return null;
  }
  hits += 1;
  // LRU touch: re-insert so the most recently used key sits at the tail.
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

export function storeEmbedding(key: string, entry: { status: number; body: unknown }): void {
  if (!config.embeddingCacheEnabled) return;
  while (cache.size >= config.embeddingCacheMaxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
    evictions += 1;
  }
  cache.set(key, {
    status: entry.status,
    body: entry.body,
    createdAt: Date.now(),
    expiresAt: Date.now() + config.embeddingCacheTtlSec * 1000,
  });
  stores += 1;
}

export function getEmbeddingCacheStats() {
  return {
    hits,
    misses,
    stores,
    evictions,
    size: cache.size,
  };
}

export function clearEmbeddingCache(): void {
  cache.clear();
  hits = 0;
  misses = 0;
  stores = 0;
  evictions = 0;
}
