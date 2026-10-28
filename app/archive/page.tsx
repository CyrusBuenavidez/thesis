import { redirect } from "next/navigation";
import { connection } from "next/server";

export const instant = false;

export default async function ArchiveRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      query.set(key, value);
    } else if (Array.isArray(value) && value.length > 0) {
      query.set(key, value[0]);
    }
  }

  const qs = query.toString();
  redirect(qs ? `/?${qs}` : "/");
}
