"use client";

import { useState, useEffect } from "react";

import { registerUser } from "@/app/(protected)/users/actions";
import { getDepartments, getPrograms } from "@/app/(protected)/settings/actions";

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserRole: string;
}

export function RegisterModal({
  isOpen,
  onClose,
  currentUserRole,
}: RegisterModalProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"invite" | "password">("password");
  const [departments, setDepartments] = useState<string[]>([]);
  const [programs, setPrograms] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      getDepartments().then((d) => setDepartments(d.map((x) => x.name))).catch(() => {});
      getPrograms().then((p) => setPrograms(p.map((x) => x.name))).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await registerUser(formData);

    setIsPending(false);
    if (!result.success) {
      setError(result.error || "Failed to register user");
    } else {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="modal-title">Register User</h2>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <div className="login-alert-error mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="reg-name">Full Name *</label>
            <input id="reg-name" name="full_name" required placeholder="e.g. Maria Santos" disabled={isPending} />
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">Institutional Email *</label>
            <input id="reg-email" name="email" type="email" required placeholder="name@pecit.edu.ph" disabled={isPending} />
          </div>

          <div className="form-group">
            <label htmlFor="reg-role">Role *</label>
            <select id="reg-role" name="role" defaultValue="student" disabled={isPending}>
              <option value="student">Student (Author)</option>
              <option value="advisor">Advisor (Faculty Reviewer)</option>
              <option value="librarian">Librarian (Manager)</option>
              {currentUserRole === "super_admin" && (
                <>
                  <option value="admin">Administrator</option>
                  <option value="super_admin">Super Administrator</option>
                </>
              )}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="reg-dept">Department</label>
              <input
                id="reg-dept"
                name="department"
                list="reg-dept-list"
                placeholder="e.g. College of Engineering"
                disabled={isPending}
              />
              <datalist id="reg-dept-list">
                {departments.map((dept) => (
                  <option key={dept} value={dept} />
                ))}
              </datalist>
            </div>

            <div className="form-group flex-1">
              <label htmlFor="reg-prog">Program</label>
              <input
                id="reg-prog"
                name="program"
                list="reg-prog-list"
                placeholder="e.g. BS Electronics Engineering"
                disabled={isPending}
              />
              <datalist id="reg-prog-list">
                {programs.map((prog) => (
                  <option key={prog} value={prog} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="form-group">
            <label>Authentication Provisioning</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="auth_mode"
                  value="password"
                  checked={authMode === "password"}
                  onChange={() => setAuthMode("password")}
                />
                <span>Set Temporary Password</span>
              </label>

              <label className="radio-label">
                <input
                  type="radio"
                  name="auth_mode"
                  value="invite"
                  checked={authMode === "invite"}
                  onChange={() => setAuthMode("invite")}
                />
                <span>Send Email Invitation Link</span>
              </label>
            </div>
          </div>

          {authMode === "password" && (
            <div className="form-group">
              <label htmlFor="reg-temp-pw">Temporary Password (forces change upon first sign-in)</label>
              <input
                id="reg-temp-pw"
                name="temporary_password"
                defaultValue="PecitTemp2026!#"
                disabled={isPending}
              />
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isPending}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isPending}>
              {isPending ? "Creating Account..." : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
