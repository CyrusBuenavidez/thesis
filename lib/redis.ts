if (typeof window !== "undefined") {
  throw new Error("This module can only be executed on the server.");
}

import { Redis } from "@upstash/redis";
import { getServerEnv } from "./env.ts";

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisInstance) {
    return redisInstance;
  }

  const env = getServerEnv();
  redisInstance = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
    keepAlive: true,
    retry: {
      retries: 2,
      backoff: (retryCount) => Math.exp(retryCount) * 20,
    },
  });

  return redisInstance;
}
