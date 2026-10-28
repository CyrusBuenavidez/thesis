import { Suspense } from "react";
import { connection } from "next/server";

import { requireRole } from "@/lib/auth/roles";
import { getReviewQueue } from "./actions";
import { ReviewQueue } from "./review-queue";

export const instant = false;

export default async function ReviewManagerPage() {
  await connection();
  await requireRole(["advisor", "librarian", "admin", "super_admin"]);

  const queueItems = await getReviewQueue();

  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading Review Queue...</div>}>
      <ReviewQueue initialQueue={queueItems} />
    </Suspense>
  );
}
