if (typeof window !== "undefined") {
  throw new Error("This module can only be executed on the server.");
}

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import { getServerEnv } from "../env.ts";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const PDF_MAGIC_BYTES = Buffer.from("%PDF-");

export function getR2Client(): S3Client {
  const env = getServerEnv();

  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
}

export async function createPresignedUploadUrl(params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{ url: string; key: string }> {
  const { key, contentType, expiresInSeconds = 900 } = params;
  const env = getServerEnv();
  const client = getR2Client();

  if (contentType !== "application/pdf") {
    throw new Error("Only PDF files (application/pdf) are permitted for submission.");
  }

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  return { url, key };
}

export async function createPresignedDownloadUrl(params: {
  key: string;
  expiresInSeconds?: number;
  filename?: string;
  inline?: boolean;
}): Promise<string> {
  const { key, expiresInSeconds = 900, filename, inline = false } = params;
  const env = getServerEnv();
  const client = getR2Client();

  const dispositionType = inline ? "inline" : "attachment";
  const disposition = filename
    ? `${dispositionType}; filename="${encodeURIComponent(filename)}"`
    : dispositionType;

  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: disposition,
  });

  return getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });
}

export interface VerifiedR2Object {
  exists: boolean;
  fileSize: number;
  sha256: string;
}

export async function verifyR2PdfObject(key: string): Promise<VerifiedR2Object> {
  const env = getServerEnv();
  const client = getR2Client();

  // 1. HeadObject: check existence and length
  let head;
  try {
    head = await client.send(
      new HeadObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
      }),
    );
  } catch (err: unknown) {
    const errorName = (err as { name?: string })?.name;
    if (errorName === "NotFound" || errorName === "NoSuchKey") {
      throw new Error(`The file at key "${key}" was never uploaded or does not exist in storage.`);
    }
    throw new Error(`Failed to locate object in R2: ${err instanceof Error ? err.message : String(err)}`);
  }

  const fileSize = head.ContentLength ?? 0;
  if (fileSize <= 0) {
    throw new Error("Uploaded file is empty (0 bytes).");
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size (${(fileSize / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 50 MB.`,
    );
  }

  // 2. Read object bytes: verify PDF magic bytes header (%PDF-) and calculate SHA-256
  const getObj = await client.send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    }),
  );

  if (!getObj.Body || !(getObj.Body instanceof Readable)) {
    throw new Error("Unable to read R2 object stream for verification.");
  }

  const hash = createHash("sha256");
  let headerChecked = false;
  const headerBuffer = Buffer.alloc(10);
  let headerBytesRead = 0;

  for await (const chunk of getObj.Body) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    hash.update(bufferChunk);

    if (!headerChecked) {
      const needed = Math.min(bufferChunk.length, 10 - headerBytesRead);
      bufferChunk.copy(headerBuffer, headerBytesRead, 0, needed);
      headerBytesRead += needed;

      if (headerBytesRead >= PDF_MAGIC_BYTES.length) {
        if (!headerBuffer.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES)) {
          throw new Error("Uploaded file header is invalid: not a legitimate PDF document.");
        }
        headerChecked = true;
      }
    }
  }

  if (!headerChecked) {
    throw new Error("File is too short to be a valid PDF document.");
  }

  const sha256 = hash.digest("hex");

  return {
    exists: true,
    fileSize,
    sha256,
  };
}

export async function deleteR2Object(key: string): Promise<void> {
  const env = getServerEnv();
  const client = getR2Client();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
      }),
    );
  } catch {
    // Ignore cleanup errors
  }
}
