import "server-only";

import { z } from "zod";

import { getServerEnv } from "@/lib/env";

const emailMessageSchema = z.object({
  to: z.array(z.email()).min(1),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1),
});

export type EmailMessage = z.infer<typeof emailMessageSchema>;

export async function sendEmail(input: unknown) {
  const message = emailMessageSchema.parse(input);
  const environment = getServerEnv();

  if (environment.EMAIL_MODE !== "console") {
    throw new Error("The configured email provider is not available yet.");
  }

  console.info(
    `[email:console] Prepared one message for ${message.to.length} recipient(s). Addresses and content are redacted.`,
  );
}
