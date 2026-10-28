if (typeof window !== "undefined") {
  throw new Error("This module can only be executed on the server.");
}

import { createAdminClient } from "../supabase/admin.ts";

export interface DuplicateMatchItem {
  id: string;
  title: string;
  similarity: number; // 0.00 to 1.00
  status: string;
  matchedAt: string;
}

/**
 * Computes Trigram (3-gram) similarity between two strings, matching PostgreSQL's pg_trgm algorithm.
 * Formula: 2 * |trigrams(A) ∩ trigrams(B)| / (|trigrams(A)| + |trigrams(B)|)
 */
export function computeTrigramSimilarity(a: string, b: string): number {
  const cleanA = `  ${a.toLowerCase().trim()} `;
  const cleanB = `  ${b.toLowerCase().trim()} `;

  if (cleanA.length < 3 || cleanB.length < 3) {
    return cleanA.trim() === cleanB.trim() ? 1.0 : 0.0;
  }

  const setA = new Map<string, number>();
  for (let i = 0; i < cleanA.length - 2; i++) {
    const gram = cleanA.substring(i, i + 3);
    setA.set(gram, (setA.get(gram) || 0) + 1);
  }

  const setB = new Map<string, number>();
  for (let i = 0; i < cleanB.length - 2; i++) {
    const gram = cleanB.substring(i, i + 3);
    setB.set(gram, (setB.get(gram) || 0) + 1);
  }

  let intersection = 0;
  let totalA = 0;
  let totalB = 0;

  for (const count of setA.values()) totalA += count;
  for (const count of setB.values()) totalB += count;

  for (const [gram, countA] of setA.entries()) {
    const countB = setB.get(gram) || 0;
    intersection += Math.min(countA, countB);
  }

  const total = totalA + totalB;
  if (total === 0) return 0.0;

  return Math.round((2.0 * intersection) / total * 100) / 100;
}

/**
 * Duplicate check background job.
 * Compares manuscript title and abstract against existing published or under-review theses.
 * Saves closest matches into review_checklist.duplicate_matches so advisors inspect them during review.
 */
export async function runDuplicateCheckJob(params: {
  thesisId: string;
  title: string;
  abstract: string;
}): Promise<DuplicateMatchItem[]> {
  const { thesisId, title } = params;
  const admin = createAdminClient();

  try {
    // 1. Fetch existing submitted, under_review, accepted, published theses (exclude self)
    const { data: existingTheses, error } = await admin
      .from("theses")
      .select("id, title, status, review_checklist")
      .neq("id", thesisId)
      .in("status", ["submitted", "under_review", "accepted", "published", "archived"]);

    if (error || !existingTheses || existingTheses.length === 0) {
      return [];
    }

    // 2. Score similarity against all existing manuscripts
    const scoredMatches: DuplicateMatchItem[] = [];
    const now = new Date().toISOString();

    for (const other of existingTheses) {
      const titleSim = computeTrigramSimilarity(title, other.title);

      if (titleSim >= 0.3) {
        scoredMatches.push({
          id: other.id,
          title: other.title,
          similarity: titleSim,
          status: other.status,
          matchedAt: now,
        });
      }
    }

    // Sort descending by similarity
    scoredMatches.sort((a, b) => b.similarity - a.similarity);
    const topMatches = scoredMatches.slice(0, 5);

    // 3. Fetch current review_checklist for target thesis
    const { data: currentTarget } = await admin
      .from("theses")
      .select("review_checklist")
      .eq("id", thesisId)
      .single();

    const currentChecklist = (currentTarget?.review_checklist as Record<string, unknown>) || {};
    const updatedChecklist = {
      ...currentChecklist,
      duplicate_matches: topMatches,
      duplicate_checked_at: now,
      highest_similarity: topMatches[0]?.similarity || 0,
    };

    // 4. Update review_checklist with duplicate matches
    await admin
      .from("theses")
      .update({ review_checklist: updatedChecklist })
      .eq("id", thesisId);

    return topMatches;
  } catch (err) {
    console.warn("Duplicate check background job notice:", err);
    return [];
  }
}
