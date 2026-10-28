import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { getRedisClient } from "@/lib/redis";

let ratelimitClient: Ratelimit | null = null;

function getRateLimiter(): Ratelimit {
  if (!ratelimitClient) {
    const redis = getRedisClient();

    ratelimitClient = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "10 m"),
      analytics: false,
      prefix: "pecit:auth:ratelimit",
      ephemeralCache: new Map(),
    });
  }

  return ratelimitClient;
}

export async function checkAuthRateLimit(identifier: string): Promise<boolean> {
  try {
    const limiter = getRateLimiter();
    const result = await limiter.limit(identifier);
    return result.success;
  } catch (error) {
    // If Redis encounters a transient failure, don't block auth, but log non-sensitive warning
    console.warn("[ratelimit] Redis unavailable, permitting attempt:", error instanceof Error ? error.message : "unknown");
    return true;
  }
}
