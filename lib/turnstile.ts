import "server-only";

import { getServerEnv } from "@/lib/env";

const DUMMY_TOKENS = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "3x00000000000000000000AA",
  "test-pass-token",
]);

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<{ success: boolean; error?: string }> {
  const env = getServerEnv();

  // In local development, if dummy key is used or bypass token
  if (env.APP_ENV !== "production") {
    if (!token || DUMMY_TOKENS.has(token) || token.startsWith("1x")) {
      return { success: true };
    }
  }

  if (!token) {
    return { success: false, error: "Security verification token is required." };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", env.TURNSTILE_SECRET_KEY);
    formData.append("response", token);
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
      },
    );

    const outcome = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    if (!outcome.success) {
      return {
        success: false,
        error: "Security verification failed. Please try again.",
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: "Verification service temporarily unreachable.",
    };
  }
}
