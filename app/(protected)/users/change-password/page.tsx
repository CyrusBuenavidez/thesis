import { redirect } from "next/navigation";
import { requireUser, getUserLandingRoute } from "@/lib/auth/roles";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const user = await requireUser();

  if (user.role === "student") {
    redirect(getUserLandingRoute(user.role));
  }

  return (
    <div className="users-page-container max-w-xl mx-auto py-8">
      <header className="mb-6">
        <h1 className="page-title">Change Password Required</h1>
        <p className="page-subtitle">
          Your account was provisioned with a temporary password. You must set a permanent password before continuing.
        </p>
      </header>

      <div className="users-table-module p-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
