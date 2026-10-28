if (typeof window !== "undefined") {
  throw new Error("This module can only be executed on the server.");
}

import { createHash } from "node:crypto";
import { getRedisClient } from "../redis.ts";

const CACHE_VERSION_KEY = "archive:search:version";
const CACHE_KEY_PREFIX = "archive:search";
const DEFAULT_TTL_SECONDS = 3600; // 1 hour per SPEC

export interface CachedSearchEnvelope<T> {
  version: number;
  cachedAt: string;
  data: T;
}

let memoryCachedVersion: { version: number; fetchedAt: number } | null = null;
const VERSION_CACHE_TTL_MS = 30000; // 30 seconds memory cache to eliminate redundant version queries

// Multi-Tier L1 in-memory cache to guarantee sub-millisecond repeated queries
interface L1SearchCacheEntry<T> {
  version: number;
  data: T;
  cachedAt: number;
}
const l1SearchCache = new Map<string, L1SearchCacheEntry<unknown>>();
const L1_TTL_MS = 60 * 1000; // 60 seconds
const L1_MAX_SIZE = 150;

/**
 * Returns current cache version number from Redis.
 * Defaults to 1 if not initialized.
 */
export async function getSearchCacheVersion(forceFresh = false): Promise<number> {
  const now = Date.now();
  if (!forceFresh && memoryCachedVersion && now - memoryCachedVersion.fetchedAt < VERSION_CACHE_TTL_MS) {
    return memoryCachedVersion.version;
  }

  const redis = getRedisClient();
  try {
    const version = await redis.get<number | string>(CACHE_VERSION_KEY);
    if (!version) {
      await redis.set(CACHE_VERSION_KEY, 1);
      memoryCachedVersion = { version: 1, fetchedAt: now };
      return 1;
    }
    const num = Number(version) || 1;
    memoryCachedVersion = { version: num, fetchedAt: now };
    return num;
  } catch (err) {
    console.warn("Failed to read search cache version from Redis:", err);
    return memoryCachedVersion?.version || 1;
  }
}

type InvalidationListener = () => void;
const invalidationListeners = new Set<InvalidationListener>();

export function onSearchCacheInvalidated(listener: InvalidationListener): () => void {
  invalidationListeners.add(listener);
  return () => {
    invalidationListeners.delete(listener);
  };
}

function notifyInvalidationListeners() {
  for (const listener of invalidationListeners) {
    try {
      listener();
    } catch (err) {
      console.warn("Search cache invalidation listener error:", err);
    }
  }
}

/**
 * Bumps the search cache version using Redis INCR.
 * Per SPEC: Old versioned keys expire naturally via TTL without expensive scan/keys calls.
 */
export async function bumpSearchCacheVersion(): Promise<number> {
  const redis = getRedisClient();
  try {
    const nextVersion = await redis.incr(CACHE_VERSION_KEY);
    memoryCachedVersion = { version: nextVersion, fetchedAt: Date.now() };
    l1SearchCache.clear(); // Immediately clear local cache on version bump
    notifyInvalidationListeners();
    return nextVersion;
  } catch (err) {
    console.warn("Failed to increment search cache version in Redis:", err);
    const fallback = (memoryCachedVersion?.version || 1) + 1;
    memoryCachedVersion = { version: fallback, fetchedAt: Date.now() };
    l1SearchCache.clear();
    notifyInvalidationListeners();
    return fallback;
  }
}

/**
 * Generates a deterministic hash for a given search query parameter set.
 */
export function buildSearchQueryHash(params: Record<string, unknown>): string {
  // Sort keys to ensure deterministic serialization
  const sortedKeys = Object.keys(params).sort();
  const normalized: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== "" && val !== "all") {
      normalized[key] = typeof val === "string" ? val.trim().toLowerCase() : val;
    }
  }

  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Retrieves cached search results for the current active version.
 * Checks L1 in-memory tier first (<1ms), then falls back to L2 Redis over keep-alive HTTP.
 */
export async function getCachedSearchResults<T>(queryHash: string): Promise<T | null> {
  try {
    const currentVersion = await getSearchCacheVersion();
    const key = `${CACHE_KEY_PREFIX}:v${currentVersion}:${queryHash}`;

    // Tier 1: Instant In-Memory Cache Lookup (< 1ms)
    const l1 = l1SearchCache.get(key);
    if (l1) {
      if (l1.version === currentVersion && Date.now() - l1.cachedAt < L1_TTL_MS) {
        return l1.data as T;
      }
      l1SearchCache.delete(key);
    }

    // Tier 2: Distributed Upstash Redis Cache Lookup
    const redis = getRedisClient();
    const cached = await redis.get<CachedSearchEnvelope<T>>(key);
    if (!cached || !cached.data) {
      return null;
    }

    // Version safety check
    if (cached.version !== currentVersion) {
      return null;
    }

    // Populate L1 cache for subsequent fast hits
    l1SearchCache.set(key, {
      version: currentVersion,
      data: cached.data,
      cachedAt: Date.now(),
    });

    if (l1SearchCache.size > L1_MAX_SIZE) {
      const oldest = l1SearchCache.keys().next().value;
      if (oldest) l1SearchCache.delete(oldest);
    }

    return cached.data;
  } catch (err) {
    console.warn("Search cache lookup error:", err);
    return null;
  }
}

/**
 * Stores search results in the cache under the current active version.
 * CRITICAL SPEC RULE: Asserts that no signed URLs are ever stored in Redis!
 */
export async function setCachedSearchResults<T>(
  queryHash: string,
  data: T,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  try {
    const serialized = JSON.stringify(data);

    // CRITICAL SPEC CHECK: Verify no presigned URLs or credentials leaked into cache
    if (
      serialized.includes("X-Amz-Signature") ||
      serialized.includes("X-Amz-Credential") ||
      serialized.includes("r2.cloudflarestorage.com") ||
      serialized.includes("blob:")
    ) {
      throw new Error("SECURITY VIOLATION: Refusing to cache object containing signed URLs or storage credentials in Redis.");
    }

    const currentVersion = await getSearchCacheVersion();
    const key = `${CACHE_KEY_PREFIX}:v${currentVersion}:${queryHash}`;

    // Populate L1 cache immediately
    l1SearchCache.set(key, {
      version: currentVersion,
      data,
      cachedAt: Date.now(),
    });

    if (l1SearchCache.size > L1_MAX_SIZE) {
      const oldest = l1SearchCache.keys().next().value;
      if (oldest) l1SearchCache.delete(oldest);
    }

    const envelope: CachedSearchEnvelope<T> = {
      version: currentVersion,
      cachedAt: new Date().toISOString(),
      data,
    };

    const redis = getRedisClient();
    await redis.set(key, envelope, { ex: ttlSeconds });
  } catch (err) {
    console.warn("Search cache write error:", err);
  }
}
