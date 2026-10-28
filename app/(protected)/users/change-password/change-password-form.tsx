"use client";

import { useState } from "react";
import { updateOwnPassword } from "@/app/(protected)/users/actions";

export function ChangePasswordForm() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const res = await updateOwnPassword(formData);

    setIsPending(false);
    if (!res.success) {
      setError(res.error || "Failed to update password");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="modal-form max-w-md w-full">
      {error && <div className="login-alert-error mb-4">{error}</div>}

      <div className="form-group">
        <label htmlFor="new_password">New Password (minimum 12 characters) *</label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          required
          minLength={12}
          placeholder="••••••••••••"
          disabled={isPending}
        />
      </div>

      <div className="form-group">
        <label htmlFor="confirm_password">Confirm New Password *</label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={12}
          placeholder="••••••••••••"
          disabled={isPending}
        />
      </div>

      <button type="submit" className="login-submit-btn mt-2" disabled={isPending}>
        {isPending ? "Updating Password..." : "Update Password & Continue"}
      </button>
    </form>
  );
}
