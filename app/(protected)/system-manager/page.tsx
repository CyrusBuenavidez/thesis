import { redirect } from "next/navigation";

export default function SystemManagerRedirectPage() {
  redirect("/settings");
}
