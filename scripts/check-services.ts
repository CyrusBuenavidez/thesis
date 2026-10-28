import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import nextEnvironment from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

import {
  EnvironmentValidationError,
  getServerEnv,
} from "../lib/env.ts";

const { loadEnvConfig } = nextEnvironment;

loadEnvConfig(process.cwd());

type Environment = ReturnType<typeof getServerEnv>;

async function checkR2(environment: Environment) {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${environment.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: environment.R2_ACCESS_KEY_ID,
      secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
  const key = `service-check/${randomUUID()}.txt`;
  let writePassed = false;
  let cleanupPassed = false;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: environment.R2_BUCKET_NAME,
        Key: key,
        Body: "PECIT service check",
        ContentType: "text/plain",
      }),
    );
    writePassed = true;
  } catch {
    writePassed = false;
  } finally {
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: environment.R2_BUCKET_NAME,
          Key: key,
        }),
      );
      cleanupPassed = true;
    } catch {
      cleanupPassed = false;
    }

    client.destroy();
  }

  return writePassed && cleanupPassed;
}

async function checkSupabase(environment: Environment) {
  try {
    const supabase = createClient(
      environment.NEXT_PUBLIC_SUPABASE_URL,
      environment.SUPABASE_SECRET_KEY,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
    const { error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    return error === null;
  } catch {
    return false;
  }
}

async function checkRedis(environment: Environment) {
  try {
    const redis = new Redis({
      url: environment.UPSTASH_REDIS_REST_URL,
      token: environment.UPSTASH_REDIS_REST_TOKEN,
    });
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}

function printResult(service: string, passed: boolean) {
  console.log(`${service}: ${passed ? "PASS" : "FAIL"}`);
}

async function main() {
  let environment: Environment;

  try {
    environment = getServerEnv();
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      console.error(error.message);
    } else {
      console.error("Environment validation failed.");
    }

    printResult("R2", false);
    printResult("Supabase", false);
    printResult("Redis", false);
    process.exitCode = 1;
    return;
  }

  const [r2Passed, supabasePassed, redisPassed] = await Promise.all([
    checkR2(environment),
    checkSupabase(environment),
    checkRedis(environment),
  ]);

  printResult("R2", r2Passed);
  printResult("Supabase", supabasePassed);
  printResult("Redis", redisPassed);

  if (!r2Passed || !supabasePassed || !redisPassed) {
    process.exitCode = 1;
  }
}

await main();
