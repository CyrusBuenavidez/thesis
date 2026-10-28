"use client";

import { useState } from "react";
import { recordPrivacyConsent } from "@/app/(protected)/privacy-actions";

interface PrivacyNoticeModalProps {
  initialNeedsConsent?: boolean;
  userName?: string;
}

export function PrivacyNoticeModal({
  initialNeedsConsent = false,
  userName = "PECIT Member",
}: PrivacyNoticeModalProps) {
  const [needsConsent, setNeedsConsent] = useState(initialNeedsConsent);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!needsConsent) return null;

  const handleAccept = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await recordPrivacyConsent();
      if (!res.success) {
        setError(res.error || "Failed to record privacy consent.");
        setIsSubmitting(false);
      } else {
        setNeedsConsent(false);
      }
    } catch {
      setError("An unexpected network error occurred.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl max-w-xl w-full min-w-0 max-h-[calc(100dvh-2rem)] overflow-hidden p-4 sm:p-8 shadow-2xl border border-slate-200 space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl font-bold">
            ⚖️
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
              Data Privacy Notice &amp; Consent
            </h2>
            <p className="text-xs text-slate-500">
              Republic Act No. 10173 (Data Privacy Act of 2012)
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-700 space-y-3 leading-relaxed max-h-60 overflow-y-auto pr-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <p>
            Welcome, <strong>{userName}</strong>. As part of the academic and research operations of the <strong>Philippine Electronics and Communication Institute of Technology (PECIT)</strong>, your personal and academic information is collected and processed in accordance with Republic Act No. 10173.
          </p>
          <div className="space-y-1.5 pt-1">
            <strong className="text-slate-900 block font-semibold">1. Purpose of Data Processing</strong>
            <p>
              Your name, institutional email, academic program, manuscript files, peer evaluations, and activity logs are processed solely for thesis archiving, degree fulfillment verification, intellectual property preservation, and institutional accreditation.
            </p>
          </div>
          <div className="space-y-1.5 pt-1">
            <strong className="text-slate-900 block font-semibold">2. Security &amp; Access Controls</strong>
            <p>
              Your thesis submissions and personal details are protected by cryptographic role-based access control (RBAC). Confidential and embargoed manuscripts are strictly shielded from public indexing until approved for release.
            </p>
          </div>
          <div className="space-y-1.5 pt-1">
            <strong className="text-slate-900 block font-semibold">3. Data Retention &amp; Rights</strong>
            <p>
              Published research metadata is permanently preserved in the institutional ETD catalog. You retain the right under RA 10173 to access, update, or request rectification of inaccurate personal records.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
            {error}
          </div>
        )}

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleAccept}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? "Recording Consent..." : "I Acknowledge & Accept Notice"}
          </button>
        </div>
      </div>
    </div>
  );
}
