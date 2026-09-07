import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('embeddingResponseCache', () => {
  let cache: typeof import('./embeddingResponseCache.js');

  beforeEach(async () => {
    vi.resetModules();
    cache = await import('./embeddingResponseCache.js');
  });

  afterEach(() => {
    cache.clearEmbeddingCache();
    delete process.env.EMBEDDING_CACHE_ENABLED;
    delete process.env.EMBEDDING_CACHE_TTL_SEC;
    delete process.env.EMBEDDING_CACHE_MAX_ENTRIES;
  });

  it('stores and retrieves a cached response', () => {
    cache.storeEmbedding('key-1', { status: 200, body: { data: [1] } });
    expect(cache.getCachedEmbedding('key-1')?.body).toEqual({ data: [1] });
  });

  it('returns null for unknown keys', () => {
    expect(cache.getCachedEmbedding('missing')).toBeNull();
  });

  it('builds distinct keys for different models and inputs', () => {
    const a = cache.buildEmbeddingCacheKey('m1', 'abc');
    const b = cache.buildEmbeddingCacheKey('m1', 'abcd');
    const c = cache.buildEmbeddingCacheKey('m2', 'abc');
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toBe(cache.buildEmbeddingCacheKey('m1', 'abc'));
  });
});
