if (typeof window !== "undefined") {
  throw new Error("This module can only be executed on the server.");
}

import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

import { getServerEnv } from "../env.ts";
import { getR2Client } from "./r2.ts";
import { createAdminClient } from "../supabase/admin.ts";

export interface OrphanSweepReport {
  scannedR2Objects: number;
  deletedOrphanCount: number;
  deletedKeys: string[];
  missingVersionFiles: string[];
  dryRun: boolean;
  executedAt: string;
}

/**
 * Nightly orphan sweep scheduled task per SPEC 8:
 * - Scans objects under submissions/
 * - Deletes uncommitted files older than 24 hours that have no thesis_versions row
 * - Flags any thesis_versions row whose file is missing in R2
 */
export async function runOrphanSweepJob(dryRun = false): Promise<OrphanSweepReport> {
  const env = getServerEnv();
  const r2 = getR2Client();
  const admin = createAdminClient();

  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // 1. Fetch all committed R2 keys from database
  const { data: committedRows, error: dbError } = await admin
    .from("thesis_versions")
    .select("r2_key, id, version_number");

  if (dbError) {
    throw new Error(`Orphan sweep failed to query database: ${dbError.message}`);
  }

  const committedKeysSet = new Set((committedRows || []).map((r) => r.r2_key));

  // 2. Scan all R2 objects under submissions/
  let continuationToken: string | undefined = undefined;
  const allSubmissionsObjects: { key: string; lastModified: Date }[] = [];

  do {
    const listCmd: ListObjectsV2Command = new ListObjectsV2Command({
      Bucket: env.R2_BUCKET_NAME,
      Prefix: "submissions/",
      ContinuationToken: continuationToken,
    });

    const response: ListObjectsV2CommandOutput = await r2.send(listCmd);
    for (const obj of response.Contents || []) {
      if (obj.Key) {
        allSubmissionsObjects.push({
          key: obj.Key,
          lastModified: obj.LastModified || new Date(),
        });
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // 3. Identify and clean orphaned objects older than 24h
  const deletedKeys: string[] = [];
  for (const obj of allSubmissionsObjects) {
    if (!committedKeysSet.has(obj.key)) {
      const ageMs = now - obj.lastModified.getTime();
      // Only sweep files older than 24 hours to avoid deleting active in-flight uploads
      if (ageMs > ONE_DAY_MS) {
        if (!dryRun) {
          try {
            await r2.send(
              new DeleteObjectCommand({
                Bucket: env.R2_BUCKET_NAME,
                Key: obj.key,
              }),
            );
            deletedKeys.push(obj.key);
          } catch (delErr) {
            console.warn(`Failed to delete orphan key ${obj.key}:`, delErr);
          }
        } else {
          deletedKeys.push(`[DRY-RUN] ${obj.key}`);
        }
      }
    }
  }

  // 4. Integrity check: check for any registered version whose file is missing
  const missingVersionFiles: string[] = [];
  const r2ExistingKeysSet = new Set(allSubmissionsObjects.map((o) => o.key));

  for (const committedKey of committedKeysSet) {
    if (!r2ExistingKeysSet.has(committedKey)) {
      missingVersionFiles.push(committedKey);
    }
  }

  return {
    scannedR2Objects: allSubmissionsObjects.length,
    deletedOrphanCount: deletedKeys.length,
    deletedKeys,
    missingVersionFiles,
    dryRun,
    executedAt: new Date().toISOString(),
  };
}
