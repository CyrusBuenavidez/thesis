import assert from "node:assert/strict";
import test from "node:test";

import {
  EnvironmentValidationError,
  validateEnvironment,
} from "../lib/env.ts";

const validEnvironment = {
  APP_URL: "http://localhost:3000",
  APP_ENV: "development",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  SUPABASE_SECRET_KEY: "server-test-key",
  R2_ACCOUNT_ID: "test-account",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET_NAME: "test-bucket",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "redis-test-token",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  JOBS_MODE: "inline",
  EMAIL_MODE: "console",
  QSTASH_TOKEN: "",
  QSTASH_CURRENT_SIGNING_KEY: "",
  QSTASH_NEXT_SIGNING_KEY: "",
  RESEND_API_KEY: "",
};

test("a missing variable is named without exposing another value", () => {
  const source = { ...validEnvironment, R2_BUCKET_NAME: undefined };

  assert.throws(
    () => validateEnvironment(source),
    (error: unknown) => {
      assert.ok(error instanceof EnvironmentValidationError);
      assert.match(error.message, /R2_BUCKET_NAME/);
      assert.doesNotMatch(error.message, /server-test-key/);
      return true;
    },
  );
});

test("valid development environment parses cleanly", () => {
  const result = validateEnvironment(validEnvironment);
  assert.equal(result.APP_ENV, "development");
  assert.equal(result.JOBS_MODE, "inline");
  assert.equal(result.EMAIL_MODE, "console");
});

test("development accepts Cloudflare dummy Turnstile secret", () => {
  const result = validateEnvironment({
    ...validEnvironment,
    APP_ENV: "development",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  });
  assert.equal(result.TURNSTILE_SECRET_KEY, "1x0000000000000000000000000000000AA");
});

test("production refuses every Cloudflare dummy Turnstile secret", () => {
  for (const secret of [
    "1x0000000000000000000000000000000AA",
    "2x0000000000000000000000000000000AA",
    "3x0000000000000000000000000000000AA",
  ]) {
    assert.throws(
      () =>
        validateEnvironment({
          ...validEnvironment,
          APP_ENV: "production",
          TURNSTILE_SECRET_KEY: secret,
        }),
      /TURNSTILE_SECRET_KEY/,
    );
  }
});

test("production accepts real non-dummy Turnstile secret", () => {
  const result = validateEnvironment({
    ...validEnvironment,
    APP_ENV: "production",
    TURNSTILE_SECRET_KEY: "real_production_secret_key_value_here",
  });
  assert.equal(result.APP_ENV, "production");
});

test("qstash mode requires qstash signing keys and token", () => {
  assert.throws(
    () =>
      validateEnvironment({
        ...validEnvironment,
        JOBS_MODE: "qstash",
        QSTASH_TOKEN: "",
      }),
    /QSTASH_TOKEN/,
  );
});

test("resend email mode requires RESEND_API_KEY", () => {
  assert.throws(
    () =>
      validateEnvironment({
        ...validEnvironment,
        EMAIL_MODE: "resend",
        RESEND_API_KEY: "",
      }),
    /RESEND_API_KEY/,
  );
});

