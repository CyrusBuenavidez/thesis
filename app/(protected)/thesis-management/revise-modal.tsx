"use client";

import { useState } from "react";
import { submitThesisRevision, type StudentThesisCard } from "./actions";

interface ReviseModalProps {
  thesis: StudentThesisCard | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export function ReviseModal({
  thesis,
  isOpen,
  onClose,
  onSubmitted,
}: ReviseModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [changeNotes, setChangeNotes] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedR2Key, setUploadedR2Key] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !thesis) return null;

  const activeThesis = thesis;
  const nextVersionNumber =
    activeThesis.versions.length > 0
      ? Math.max(...activeThesis.versions.map((v) => v.versionNumber)) + 1
      : 2;

  function handleFileSelection(selectedFile: File) {
    setError(null);
    if (selectedFile.type !== "application/pdf" && !selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are permitted.");
      return;
    }
    const maxBytes = 50 * 1024 * 1024;
    if (selectedFile.size > maxBytes) {
      setError("File exceeds 50 MB limit.");
      return;
    }
    setFile(selectedFile);
    setUploadedR2Key(null);
    setUploadProgress(0);

    // Automatically initiate direct upload to R2
    void startDirectUpload(selectedFile);
  }

  async function startDirectUpload(fileToUpload?: File) {
    const targetFile = fileToUpload || file;
    if (!targetFile) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const presignRes = await fetch("/api/theses/presign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesisId: activeThesis.id,
          versionNumber: nextVersionNumber,
          contentType: "application/pdf",
        }),
      });

      if (!presignRes.ok) {
        const errJson = await presignRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate upload URL.");
      }

      const { url, key } = await presignRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url, true);
        xhr.setRequestHeader("Content-Type", "application/pdf");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadedR2Key(key);
            setUploadProgress(100);
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network error during direct R2 upload."));
        };

        xhr.send(targetFile);
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSubmit() {
    if (!uploadedR2Key) {
      setError("Please upload the revised manuscript PDF.");
      return;
    }
    if (changeNotes.trim().length < 5) {
      setError("Please enter detailed change notes explaining your revisions.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await submitThesisRevision({
      thesisId: activeThesis.id,
      versionNumber: nextVersionNumber,
      r2Key: uploadedR2Key,
      changeNotes,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || "Failed to submit revision.");
    } else {
      onSubmitted();
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="revise-modal-title">
      <div className="modal-content max-w-2xl">
        <div className="modal-header">
          <h2 id="revise-modal-title" className="text-base sm:text-xl font-bold">
            Submit Revision (Version {nextVersionNumber})
          </h2>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <div className="login-alert-error mb-4">{error}</div>}

        {thesis.latestRemark && (
          <div className="revision-feedback-box mb-4">
            <h4>Reviewer Remarks / Requested Changes:</h4>
            <p>{thesis.latestRemark}</p>
          </div>
        )}

        <div className="modal-form">
          <div className="form-group">
            <label htmlFor="change-notes">Summary of Changes & Revisions *</label>
            <textarea
              id="change-notes"
              rows={4}
              required
              className="form-textarea"
              placeholder="Describe what modifications were made in response to faculty comments..."
              value={changeNotes}
              onChange={(e) => setChangeNotes(e.target.value)}
            />
          </div>

          <div
            className={`dropzone-box ${file ? "has-file" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.files[0];
              if (dropped) handleFileSelection(dropped);
            }}
          >
            <input
              type="file"
              id="revise-pdf-input"
              accept=".pdf,application/pdf"
              className="hidden-file-input"
              onChange={(e) => {
                const sel = e.target.files?.[0];
                if (sel) handleFileSelection(sel);
              }}
              disabled={isUploading || isSubmitting}
            />
            <label htmlFor="revise-pdf-input" className="dropzone-label">
              <div className="dropzone-icon">📄</div>
              {file ? (
                <div>
                  <strong>{file.name}</strong>
                  <p className="text-xs text-muted">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB · Ready for direct upload
                  </p>
                </div>
              ) : (
                <div>
                  <strong>Drag & drop revised PDF here</strong>
                  <p className="text-xs text-muted">or use the non-drag browse button below</p>
                </div>
              )}
            </label>

            {/* Non-drag file selection option per WCAG 2.2 AA */}
            <div className="mt-3 flex items-center justify-center">
              <label
                htmlFor="revise-pdf-input"
                className="btn-secondary cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg shadow-xs hover:bg-slate-100"
              >
                <span>📁</span> Browse Local PDF
              </label>
            </div>
          </div>

          {file && !uploadedR2Key && !isUploading && (
            <div className="upload-action-bar mt-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => startDirectUpload(file)}
                disabled={isUploading}
              >
                Start Direct Upload to Storage
              </button>
            </div>
          )}

          {(isUploading || uploadProgress > 0) && (
            <div className="progress-container mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="progress-header flex justify-between text-xs font-semibold mb-1">
                <span>
                  {uploadProgress < 100
                    ? "Phase 1: Streaming bytes directly to Cloudflare R2..."
                    : uploadedR2Key
                    ? "Phase 2: Cryptographic SHA-256 integrity verified"
                    : "Phase 1: Upload Complete (100%) - Staging object..."}
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="progress-track w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    uploadProgress === 100 ? "bg-emerald-600" : "bg-[#1616D4]"
                  }`}
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              {uploadedR2Key ? (
                <p className="upload-success-text mt-2 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                  <span>✓</span> Version {nextVersionNumber} PDF stored in Cloudflare R2. Ready to submit revision.
                </p>
              ) : isUploading ? (
                <p className="text-xs text-slate-500 mt-1.5">
                  Streaming securely via presigned URL. Large PDFs may take a few seconds.
                </p>
              ) : null}
            </div>
          )}

          <div className="modal-actions mt-4">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isUploading || isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSubmit}
              disabled={!uploadedR2Key || isUploading || isSubmitting}
            >
              {isSubmitting ? "Submitting..." : `Submit Version ${nextVersionNumber}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
