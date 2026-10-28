import { Suspense } from "react";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth/roles";
import { getMyTheses } from "./actions";
import { ThesisManagementClient } from "./thesis-management-client";

export const instant = false;

export default async function ThesisManagementPage() {
  await connection();
  const user = await requireUser();
  const initialTheses = await getMyTheses();

  return (
    <Suspense fallback={<div className="loading-bar">Loading Thesis Management catalog...</div>}>
      <ThesisManagementClient
        initialTheses={initialTheses}
        currentUserFullName={user.full_name}
      />
    </Suspense>
  );
}
