import "server-only";

import { getServerEnv } from "@/lib/env";

export async function runJobInline<Result>(job: () => Promise<Result>) {
  const environment = getServerEnv();

  if (environment.JOBS_MODE !== "inline") {
    throw new Error("The configured background job runner is not available yet.");
  }

  return job();
}
