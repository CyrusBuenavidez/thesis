import { z } from "zod";

const requiredText = z.string().trim().min(1);
const optionalText = z.string().trim().optional().default("");

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: requiredText,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: requiredText,
});

const serverEnvironmentSchema = publicEnvironmentSchema
  .extend({
    APP_URL: z.url(),
    APP_ENV: z.enum(["development", "staging", "production"]),
    SUPABASE_SECRET_KEY: requiredText,
    R2_ACCOUNT_ID: requiredText,
    R2_ACCESS_KEY_ID: requiredText,
    R2_SECRET_ACCESS_KEY: requiredText,
    R2_BUCKET_NAME: requiredText,
    UPSTASH_REDIS_REST_URL: z.url(),
    UPSTASH_REDIS_REST_TOKEN: requiredText,
    TURNSTILE_SECRET_KEY: requiredText,
    JOBS_MODE: z.enum(["inline", "qstash"]),
    EMAIL_MODE: z.enum(["console", "resend"]),
    QSTASH_TOKEN: optionalText,
    QSTASH_CURRENT_SIGNING_KEY: optionalText,
    QSTASH_NEXT_SIGNING_KEY: optionalText,
    RESEND_API_KEY: optionalText,
  })
  .superRefine((environment, context) => {
    const dummyTurnstileSecrets = new Set([
      "1x0000000000000000000000000000000AA",
      "2x0000000000000000000000000000000AA",
      "3x0000000000000000000000000000000AA",
    ]);

    if (
      environment.APP_ENV === "production" &&
      dummyTurnstileSecrets.has(environment.TURNSTILE_SECRET_KEY)
    ) {
      context.addIssue({
        code: "custom",
        message: "must not use a Cloudflare test secret in production",
        path: ["TURNSTILE_SECRET_KEY"],
      });
    }

    if (environment.JOBS_MODE === "qstash") {
      for (const name of [
        "QSTASH_TOKEN",
        "QSTASH_CURRENT_SIGNING_KEY",
        "QSTASH_NEXT_SIGNING_KEY",
      ] as const) {
        if (!environment[name]) {
          context.addIssue({
            code: "custom",
            message: "is required when JOBS_MODE is qstash",
            path: [name],
          });
        }
      }
    }

    if (environment.EMAIL_MODE === "resend" && !environment.RESEND_API_KEY) {
      context.addIssue({
        code: "custom",
        message: "is required when EMAIL_MODE is resend",
        path: ["RESEND_API_KEY"],
      });
    }
  });

type EnvironmentSource = Record<string, string | undefined>;

export class EnvironmentValidationError extends Error {
  constructor(variableNames: string[]) {
    const names = [...new Set(variableNames)].sort().join(", ");
    super(`Invalid environment configuration. Check: ${names}`);
    this.name = "EnvironmentValidationError";
  }
}

function publicEnvironmentSource(): EnvironmentSource {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY:
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  };
}

function serverEnvironmentSource(): EnvironmentSource {
  return {
    ...publicEnvironmentSource(),
    APP_URL: process.env.APP_URL,
    APP_ENV: process.env.APP_ENV,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    JOBS_MODE: process.env.JOBS_MODE,
    EMAIL_MODE: process.env.EMAIL_MODE,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };
}

function parseEnvironment<T>(
  schema: z.ZodType<T>,
  source: EnvironmentSource,
): T {
  const result = schema.safeParse(source);

  if (!result.success) {
    const variableNames = result.error.issues.map((issue) =>
      String(issue.path[0] ?? "environment"),
    );
    throw new EnvironmentValidationError(variableNames);
  }

  return result.data;
}

export function getPublicEnv() {
  return parseEnvironment(publicEnvironmentSchema, publicEnvironmentSource());
}

export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("Server environment is not available in the browser.");
  }

  return parseEnvironment(serverEnvironmentSchema, serverEnvironmentSource());
}

export function validateEnvironment(source: EnvironmentSource) {
  return parseEnvironment(serverEnvironmentSchema, source);
}
