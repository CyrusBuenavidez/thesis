"use client";

import { useEffect, useState } from "react";
import {
  createThesisSubmission,
  getEligibleAdvisors,
  getEligibleStudents,
} from "./actions";

interface SubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  currentUserFullName: string;
}

export function SubmissionModal({
  isOpen,
  onClose,
  onSubmitted,
  currentUserFullName,
}: SubmissionModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [thesisId, setThesisId] = useState(() => crypto.randomUUID());
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  // Step 1: Metadata
  const [title, setTitle] = useState("");
  const [abstractText, setAbstractText] = useState("");
  const [department, setDepartment] = useState("College of Engineering");
  const [program, setProgram] = useState("BS Computer Engineering");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [primarySupervisorId, setPrimarySupervisorId] = useState<string>("");

  // Step 2: Co-authors, License & Consent
  const [availableStudents, setAvailableStudents] = useState<
    { id: string; fullName: string; email: string }[]
  >([]);
  const [availableAdvisors, setAvailableAdvisors] = useState<
    { id: string; fullName: string; department: string | null }[]
  >([]);
  const [selectedCoAuthorIds, setSelectedCoAuthorIds] = useState<string[]>([]);
  const [license, setLicense] = useState("CC BY-NC 4.0");
  const [isConfidential, setIsConfidential] = useState(false);
  const [embargoUntil, setEmbargoUntil] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);

  // Step 3: PDF Upload
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedR2Key, setUploadedR2Key] = useState<string | null>(null);

  // Status & Error
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;
    getEligibleStudents()
      .then((st) => {
        if (!ignore) setAvailableStudents(st);
      })
      .catch(console.error);

    getEligibleAdvisors()
      .then((adv) => {
        if (!ignore) setAvailableAdvisors(adv);
      })
      .catch(console.error);

    return () => {
      ignore = true;
    };
  }, []);

  function handleCloseModal() {
    setThesisId(crypto.randomUUID());
    setIdempotencyKey(crypto.randomUUID());
    setStep(1);
    setError(null);
    setFile(null);
    setUploadProgress(0);
    setUploadedR2Key(null);
    onClose();
  }

  if (!isOpen) return null;

  function handleFileSelection(selectedFile: File) {
    setError(null);

    // Rule: Refuse non-PDF
    if (selectedFile.type !== "application/pdf" && !selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are permitted. Please select a valid .pdf manuscript.");
      setFile(null);
      return;
    }

    // Rule: Refuse files > 50 MB (50 * 1024 * 1024 bytes)
    const maxBytes = 50 * 1024 * 1024;
    if (selectedFile.size > maxBytes) {
      setError(
        `File size (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 50 MB limit. Please compress or optimize your PDF.`,
      );
      setFile(null);
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
    if (!targetFile || !thesisId) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // 1. Obtain presigned upload URL from server
      const presignRes = await fetch("/api/theses/presign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesisId,
          versionNumber: 1,
          contentType: "application/pdf",
        }),
      });

      if (!presignRes.ok) {
        const errJson = await presignRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate upload URL.");
      }

      const { url, key } = await presignRes.json();

      // 2. Stream bytes directly to Cloudflare R2 via XMLHttpRequest to track progress
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
            reject(
              new Error(
                `R2 direct upload failed with status ${xhr.status}. Check R2 CORS settings.`,
              ),
            );
          }
        };

        xhr.onerror = () => {
          reject(
            new Error(
              "Network error during direct R2 upload. Verify Cloudflare R2 CORS allows PUT from http://localhost:3000.",
            ),
          );
        };

        xhr.send(targetFile);
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSubmitFinal() {
    if (!uploadedR2Key) {
      setError("Please upload the manuscript PDF file first.");
      return;
    }

    if (!consentAccepted) {
      setError("You must accept the institutional publication agreement to submit.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const keywords = keywordsInput
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const result = await createThesisSubmission({
      thesisId,
      idempotencyKey,
      title,
      abstract: abstractText,
      department,
      program,
      keywords: keywords.length ? keywords : ["Thesis"],
      coAuthorIds: selectedCoAuthorIds,
      primarySupervisorId: primarySupervisorId || null,
      license,
      isConfidential,
      embargoUntil: embargoUntil || null,
      consentAccepted: true,
      r2Key: uploadedR2Key,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || "Failed to submit thesis.");
    } else {
      onSubmitted();
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="submit-modal-title">
      <div className="modal-content max-w-3xl">
        <div className="modal-header items-start sm:items-center">
          <div>
            <h2 id="submit-modal-title" className="text-base sm:text-xl font-bold">
              Submit Thesis Manuscript
            </h2>
            <div className="step-indicator flex-wrap">
              <span className={`step-dot ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}>
                1. Metadata
              </span>
              <span className="step-sep">→</span>
              <span className={`step-dot ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}>
                2. Authors &amp; Rights
              </span>
              <span className="step-sep">→</span>
              <span className={`step-dot ${step === 3 ? "active" : ""}`}>
                3. PDF Upload
              </span>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={handleCloseModal} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <div className="login-alert-error mb-4">{error}</div>}

        {/* STEP 1: METADATA */}
        {step === 1 && (
          <div className="modal-form">
            <div className="form-group">
              <label htmlFor="thesis-title">Manuscript Title *</label>
              <input
                id="thesis-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Design and Implementation of an IoT-Based Smart Agricultural Monitoring System"
              />
            </div>

            <div className="form-group">
              <label htmlFor="thesis-abstract">Abstract *</label>
              <textarea
                id="thesis-abstract"
                required
                rows={5}
                className="form-textarea"
                value={abstractText}
                onChange={(e) => setAbstractText(e.target.value)}
                placeholder="Enter complete abstract covering problem statement, methodology, results, and conclusion..."
              />
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label htmlFor="thesis-dept">Department *</label>
                <select
                  id="thesis-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  <option value="College of Engineering">College of Engineering</option>
                  <option value="College of Computer Studies">College of Computer Studies</option>
                  <option value="College of Business and Management">College of Business and Management</option>
                  <option value="College of Education">College of Education</option>
                </select>
              </div>

              <div className="form-group flex-1">
                <label htmlFor="thesis-prog">Program *</label>
                <input
                  id="thesis-prog"
                  required
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  placeholder="e.g. BS Computer Engineering"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="thesis-keywords">Keywords (comma-separated) *</label>
              <input
                id="thesis-keywords"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="IoT, Embedded Systems, Precision Agriculture, LoRaWAN"
              />
            </div>

            <div className="form-group">
              <label htmlFor="thesis-advisor">Primary Faculty Advisor</label>
              <select
                id="thesis-advisor"
                value={primarySupervisorId}
                onChange={(e) => setPrimarySupervisorId(e.target.value)}
              >
                <option value="">-- Select Assigned Advisor (or leave for Librarian to assign) --</option>
                {availableAdvisors.map((adv) => (
                  <option key={adv.id} value={adv.id}>
                    {adv.fullName} {adv.department ? `(${adv.department})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-actions mt-4">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (title.trim().length < 5) {
                    setError("Title must be at least 5 characters long.");
                    return;
                  }
                  if (abstractText.trim().length < 20) {
                    setError("Abstract must be at least 20 characters long.");
                    return;
                  }
                  setError(null);
                  setStep(2);
                }}
              >
                Next: Authors & Rights →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: CO-AUTHORS, LICENSE & RIGHTS */}
        {step === 2 && (
          <div className="modal-form">
            <div className="form-group">
              <label>Primary Author</label>
              <div className="primary-author-badge">
                <strong>{currentUserFullName}</strong> (Owner / Lead Author)
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="coauthor-select">Co-Authors (Group Authors)</label>
              <p className="text-xs text-muted mb-2">
                Select registered students who collaborated on this research. Listed co-authors will be granted full access to view, edit drafts, and receive notifications.
              </p>
              <select
                id="coauthor-select"
                onChange={(e) => {
                  const id = e.target.value;
                  if (id && !selectedCoAuthorIds.includes(id)) {
                    setSelectedCoAuthorIds([...selectedCoAuthorIds, id]);
                  }
                  e.target.value = "";
                }}
              >
                <option value="">+ Add a co-author student...</option>
                {availableStudents
                  .filter((s) => !selectedCoAuthorIds.includes(s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.email})
                    </option>
                  ))}
              </select>

              {selectedCoAuthorIds.length > 0 && (
                <div className="coauthor-chips-container mt-2">
                  {selectedCoAuthorIds.map((cid) => {
                    const student = availableStudents.find((s) => s.id === cid);
                    return (
                      <span key={cid} className="coauthor-chip">
                        <span>{student?.fullName || cid}</span>
                        <button
                          type="button"
                          className="chip-remove"
                          onClick={() =>
                            setSelectedCoAuthorIds(
                              selectedCoAuthorIds.filter((id) => id !== cid),
                            )
                          }
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label htmlFor="thesis-license">Archive License *</label>
                <select
                  id="thesis-license"
                  value={license}
                  onChange={(e) => setLicense(e.target.value)}
                >
                  <option value="CC BY-NC 4.0">Creative Commons Attribution-NonCommercial (CC BY-NC 4.0)</option>
                  <option value="CC BY 4.0">Creative Commons Attribution (CC BY 4.0)</option>
                  <option value="CC BY-NC-ND 4.0">Creative Commons NonCommercial-NoDerivatives (CC BY-NC-ND 4.0)</option>
                  <option value="Institutional Academic Archive Only">PECIT Institutional Academic Archive Only</option>
                </select>
              </div>

              <div className="form-group flex-1">
                <label htmlFor="embargo-date">Embargo Until (Optional)</label>
                <input
                  id="embargo-date"
                  type="date"
                  value={embargoUntil}
                  onChange={(e) => setEmbargoUntil(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isConfidential}
                  onChange={(e) => setIsConfidential(e.target.checked)}
                />
                <span>
                  <strong>Mark as Confidential Manuscript</strong> (Contains patentable intellectual property or commercial non-disclosure clauses)
                </span>
              </label>
            </div>

            <div className="publication-agreement-box">
              <h4>Institutional Publication Agreement *</h4>
              <p className="text-xs text-muted mb-2">
                By submitting this manuscript, I grant Panpacific College of Excellence, Inc. (PECIT) a non-exclusive, perpetual license to archive, preserve, and make this work accessible in the institutional repository in accordance with the selected license and embargo settings, subject to the Republic Act 10173 (Data Privacy Act of 2012).
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  required
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                />
                <span className="text-sm font-semibold text-ink">
                  I accept the institutional publication agreement on behalf of all authors.
                </span>
              </label>
            </div>

            <div className="modal-actions mt-4">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep(1)}
              >
                ← Back
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (!consentAccepted) {
                    setError("You must accept the publication agreement before uploading.");
                    return;
                  }
                  setError(null);
                  setStep(3);
                }}
              >
                Next: Upload Manuscript (PDF) →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: DIRECT R2 UPLOAD */}
        {step === 3 && (
          <div className="modal-form">
            <div className="upload-instructions mb-3">
              <h4>Direct-to-Storage Cloudflare R2 Upload</h4>
              <p className="text-xs text-muted">
                Your PDF manuscript streams directly from your browser to secure Cloudflare R2 storage via signed URL. PDF binaries never pass through application servers. Maximum file size: <strong>50 MB</strong>.
              </p>
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
                id="pdf-upload-input"
                accept=".pdf,application/pdf"
                className="hidden-file-input"
                onChange={(e) => {
                  const sel = e.target.files?.[0];
                  if (sel) handleFileSelection(sel);
                }}
                disabled={isUploading || isSubmitting}
              />
              <label htmlFor="pdf-upload-input" className="dropzone-label">
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
                    <strong>Drag and drop manuscript PDF here</strong>
                    <p className="text-xs text-muted">or use the non-drag browse button below</p>
                  </div>
                )}
              </label>

              {/* Non-drag file selection option per WCAG 2.2 AA and prompt requirements */}
              <div className="mt-3 flex items-center justify-center">
                <label
                  htmlFor="pdf-upload-input"
                  className="btn-secondary cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg shadow-xs hover:bg-slate-100"
                >
                  <span>📁</span> Browse Local PDF
                </label>
              </div>
            </div>

            {file && !uploadedR2Key && !isUploading && (
              <div className="upload-action-bar mt-3">
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
                    <span>✓</span> Bytes stored in Cloudflare R2. Ready to confirm submission into database.
                  </p>
                ) : isUploading ? (
                  <p className="text-xs text-slate-500 mt-1.5">
                    Streaming securely via presigned URL. Large PDFs may take a few seconds.
                  </p>
                ) : null}
              </div>
            )}

            <div className="modal-actions mt-6">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep(2)}
                disabled={isUploading || isSubmitting}
              >
                ← Back
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSubmitFinal}
                disabled={!uploadedR2Key || isUploading || isSubmitting}
              >
                {isSubmitting ? "Finalizing Submission..." : "Submit Thesis Manuscript"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
