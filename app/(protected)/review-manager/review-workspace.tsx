"use client";

import { useState } from "react";
import Link from "next/link";
import {
  type ReviewDetails,
  addPdfAnnotation,
  deletePdfAnnotation,
  executeReviewDecision,
  saveReviewChecklist,
} from "./actions";

interface ReviewWorkspaceProps {
  initialDetails: ReviewDetails;
  onBackToQueue: () => void;
  onDecisionCompleted: () => void;
}

const DEFAULT_RUBRIC_ITEMS = [
  { id: "rubric_problem", label: "Clear problem statement, research gap, and well-defined objectives" },
  { id: "rubric_literature", label: "Comprehensive, up-to-date literature review and theoretical framework" },
  { id: "rubric_methodology", label: "Sound methodology, research design, and ethical compliance" },
  { id: "rubric_data", label: "Rigorous data analysis, valid findings, and substantiated conclusions" },
  { id: "rubric_formatting", label: "Adherence to institutional format, citations (IEEE/APA), and writing standards" },
  { id: "rubric_originality", label: "Demonstrated original contribution with verified similarity index" },
];

export function ReviewWorkspace({
  initialDetails,
  onBackToQueue,
  onDecisionCompleted,
}: ReviewWorkspaceProps) {
  const [details, setDetails] = useState<ReviewDetails>(initialDetails);
  const [activeTab, setActiveTab] = useState<"rubric" | "comments" | "decision">("rubric");
  const [mobileViewTab, setMobileViewTab] = useState<"pdf" | "evaluation">("evaluation");
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<number>(0);

  // Rubric state
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    details.reviewChecklist || {},
  );
  const [isSavingChecklist, setIsSavingChecklist] = useState(false);
  const [checklistSavedNote, setChecklistSavedNote] = useState(false);

  // Annotation state
  const [pageNumberInput, setPageNumberInput] = useState<number>(1);
  const [commentInput, setCommentInput] = useState<string>("");
  const [isAddingComment, setIsAddingComment] = useState(false);

  // Decision state
  const [decisionModal, setDecisionModal] = useState<"revisions" | "accept" | "reject" | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentVersion = details.versions[selectedVersionIndex] || details.versions[0];
  const activeAnnotations = details.annotations.filter(
    (a) => !currentVersion || a.versionId === currentVersion.id,
  );

  async function handleToggleRubric(itemKey: string) {
    const updated = { ...checklist, [itemKey]: !checklist[itemKey] };
    setChecklist(updated);
    setIsSavingChecklist(true);
    setChecklistSavedNote(false);

    const res = await saveReviewChecklist(details.id, updated);
    setIsSavingChecklist(false);
    if (res.success) {
      setChecklistSavedNote(true);
      setTimeout(() => setChecklistSavedNote(false), 2500);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentInput.trim() || !currentVersion) return;

    setIsAddingComment(true);
    setError(null);

    const res = await addPdfAnnotation({
      thesisId: details.id,
      versionId: currentVersion.id,
      pageNumber: pageNumberInput,
      content: commentInput.trim(),
    });

    setIsAddingComment(false);

    if (!res.success || !res.annotation) {
      setError(res.error || "Failed to add annotation");
    } else {
      setDetails({
        ...details,
        annotations: [res.annotation, ...details.annotations],
      });
      setCommentInput("");
    }
  }

  async function handleDeleteComment(annotationId: string) {
    const res = await deletePdfAnnotation(annotationId);
    if (res.success) {
      setDetails({
        ...details,
        annotations: details.annotations.filter((a) => a.id !== annotationId),
      });
    } else {
      setError(res.error || "Failed to delete annotation");
    }
  }

  async function handleConfirmDecision(decision: "start_review" | "request_revisions" | "accept" | "reject") {
    setIsSubmittingDecision(true);
    setError(null);

    const res = await executeReviewDecision({
      thesisId: details.id,
      decision,
      reason: decisionReason,
    });

    setIsSubmittingDecision(false);

    if (!res.success) {
      setError(res.error || "Failed to execute decision");
    } else {
      setDecisionModal(null);
      setDecisionReason("");
      onDecisionCompleted();
    }
  }

  return (
    <div className="review-workspace">
      {/* Top action header */}
      <div className="workspace-header flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <button
            type="button"
            className="btn-secondary btn-sm shrink-0"
            onClick={onBackToQueue}
          >
            ← Queue
          </button>
          <div className="min-w-0">
            <h1 className="workspace-title text-base sm:text-xl font-bold line-clamp-2 sm:line-clamp-none">{details.title}</h1>
            <p className="text-xs text-muted line-clamp-1 sm:line-clamp-none">
              Authors: {details.authors.join(", ")} • {details.department} ({details.program})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`status-badge status-${details.status}`}>
            {details.status.replace("_", " ").toUpperCase()}
          </span>

          {currentVersion?.downloadUrl && (
            <Link
              href={currentVersion.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary btn-sm"
            >
              Open PDF ↗
            </Link>
          )}
        </div>
      </div>

      {error && <div className="login-alert-error mb-3">{error}</div>}

      {/* Mobile & Tablet Viewport Tab Switcher (< 1024px) */}
      <div className="lg:hidden flex items-center p-1 bg-slate-200/80 rounded-xl mb-4 gap-1">
        <button
          type="button"
          onClick={() => setMobileViewTab("pdf")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            mobileViewTab === "pdf"
              ? "bg-white text-[#1616D4] shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          📄 Manuscript PDF
        </button>
        <button
          type="button"
          onClick={() => setMobileViewTab("evaluation")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            mobileViewTab === "evaluation"
              ? "bg-white text-[#1616D4] shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          📋 Rubric &amp; Feedback ({activeAnnotations.length})
        </button>
      </div>

      {/* Split Pane: side-by-side on desktop, cleanly segmented on mobile/tablet */}
      <div className="split-pane-container">
        {/* LEFT PANE: PDF VIEWER (shown on desktop OR when mobileViewTab === 'pdf') */}
        <div className={`split-pane-left ${mobileViewTab === "pdf" ? "block" : "hidden lg:flex"}`}>
          <div className="pdf-viewer-bar">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted">Version:</span>
              <select
                className="version-select"
                value={selectedVersionIndex}
                onChange={(e) => setSelectedVersionIndex(Number(e.target.value))}
              >
                {details.versions.map((v, idx) => (
                  <option key={v.id} value={idx}>
                    v{v.versionNumber} ({new Date(v.createdAt).toLocaleDateString()}) - {(v.fileSize / (1024 * 1024)).toFixed(1)} MB
                  </option>
                ))}
              </select>
            </div>

            {currentVersion?.changeNotes && (
              <span className="text-xs text-muted truncate max-w-sm">
                Notes: &ldquo;{currentVersion.changeNotes}&rdquo;
              </span>
            )}
          </div>

          <div className="pdf-frame-wrapper">
            {currentVersion?.downloadUrl ? (
              <iframe
                title="Manuscript PDF Viewer"
                src={currentVersion.downloadUrl}
                className="pdf-iframe"
              />
            ) : (
              <div className="pdf-placeholder-box">
                <p>No preview available for this manuscript version.</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE: EVALUATION & DECISION TOOLS (shown on desktop OR when mobileViewTab === 'evaluation') */}
        <div className={`split-pane-right ${mobileViewTab === "evaluation" ? "block" : "hidden lg:flex"}`}>
          {/* Tabs */}
          <div className="workspace-tabs">
            <button
              type="button"
              className={`workspace-tab ${activeTab === "rubric" ? "active" : ""}`}
              onClick={() => setActiveTab("rubric")}
            >
              Rubric Checklist
            </button>
            <button
              type="button"
              className={`workspace-tab ${activeTab === "comments" ? "active" : ""}`}
              onClick={() => setActiveTab("comments")}
            >
              Comments ({activeAnnotations.length})
            </button>
            <button
              type="button"
              className={`workspace-tab ${activeTab === "decision" ? "active" : ""}`}
              onClick={() => setActiveTab("decision")}
            >
              Decision
            </button>
          </div>

          <div className="workspace-tab-content">
            {/* TAB 1: RUBRIC */}
            {activeTab === "rubric" && (
              <div className="rubric-panel">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">Institutional Evaluation Criteria</h3>
                  {isSavingChecklist && <span className="text-xs text-muted">Saving...</span>}
                  {checklistSavedNote && <span className="text-xs text-emerald-600">✓ Saved</span>}
                </div>

                <div className="rubric-checklist">
                  {DEFAULT_RUBRIC_ITEMS.map((item) => (
                    <label key={item.id} className="rubric-checkbox-item">
                      <input
                        type="checkbox"
                        checked={Boolean(checklist[item.id])}
                        onChange={() => handleToggleRubric(item.id)}
                      />
                      <span className="rubric-text">{item.label}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-muted/20 rounded border border-border text-xs text-muted">
                  <strong>Rubric Guidance:</strong> Checking off these items documents that the manuscript adheres to PECIT research and ethical standards before granting endorsement.
                </div>
              </div>
            )}

            {/* TAB 2: PAGE COMMENTS & ANNOTATIONS */}
            {activeTab === "comments" && (
              <div className="annotations-panel">
                <form onSubmit={handleAddComment} className="annotation-form mb-4">
                  <h3 className="font-semibold text-sm mb-2">Add Page Comment</h3>
                  <div className="form-row mb-2">
                    <div className="w-28">
                      <label htmlFor="comment-page" className="text-xs">Page #</label>
                      <input
                        id="comment-page"
                        type="number"
                        min={1}
                        value={pageNumberInput}
                        onChange={(e) => setPageNumberInput(Number(e.target.value))}
                        required
                        className="form-input text-xs"
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <textarea
                      rows={3}
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      placeholder="Enter specific critique or revision instructions for this page..."
                      required
                      className="form-textarea text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-primary btn-sm"
                    disabled={isAddingComment}
                  >
                    {isAddingComment ? "Posting..." : "Add Comment"}
                  </button>
                </form>

                <div className="annotation-list">
                  <h4 className="text-xs font-semibold text-muted mb-2">
                    Comments on v{currentVersion?.versionNumber || 1}:
                  </h4>

                  {activeAnnotations.length === 0 ? (
                    <p className="text-xs text-muted italic">No comments added yet for this version.</p>
                  ) : (
                    activeAnnotations.map((a) => (
                      <div key={a.id} className="annotation-card">
                        <div className="annotation-card-header">
                          <span className="page-tag">Page {a.pageNumber}</span>
                          <span className="text-xs text-muted">
                            {a.authorName} • {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <button
                            type="button"
                            className="chip-remove ml-auto"
                            onClick={() => handleDeleteComment(a.id)}
                            title="Delete comment"
                          >
                            ✕
                          </button>
                        </div>
                        <p className="annotation-content">{a.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: DECISION & LIFECYCLE ACTIONS */}
            {activeTab === "decision" && (
              <div className="decision-panel">
                <h3 className="font-semibold text-sm mb-2">Evaluation Actions</h3>
                <p className="text-xs text-muted mb-4">
                  All status transitions are recorded in the institutional audit log and automatically dispatch notification alerts to authors.
                </p>

                {details.status === "submitted" && (
                  <div className="decision-card">
                    <h4>Manuscript Submitted</h4>
                    <p className="text-xs text-muted mb-3">
                      This manuscript has been submitted for your review. Click below to begin your formal evaluation.
                    </p>
                    <button
                      type="button"
                      className="btn-primary w-full"
                      onClick={() => handleConfirmDecision("start_review")}
                      disabled={isSubmittingDecision}
                    >
                      {isSubmittingDecision ? "Processing..." : "Start Formal Review"}
                    </button>
                  </div>
                )}

                {details.status === "under_review" && (
                  <div className="flex flex-col gap-3">
                    <div className="decision-card">
                      <h4 className="text-emerald-700 font-semibold">Endorse / Accept Manuscript</h4>
                      <p className="text-xs text-muted mb-2">
                        Mark this thesis as satisfactory and recommended for publication.
                      </p>
                      <button
                        type="button"
                        className="btn-primary w-full"
                        onClick={() => setDecisionModal("accept")}
                      >
                        Accept Manuscript
                      </button>
                    </div>

                    <div className="decision-card">
                      <h4 className="text-amber-700 font-semibold">Request Revisions</h4>
                      <p className="text-xs text-muted mb-2">
                        Instruct authors to make required changes. Written revision instructions are required.
                      </p>
                      <button
                        type="button"
                        className="btn-secondary w-full"
                        onClick={() => setDecisionModal("revisions")}
                      >
                        Request Revisions
                      </button>
                    </div>

                    <div className="decision-card">
                      <h4 className="text-rose-700 font-semibold">Reject Manuscript</h4>
                      <p className="text-xs text-muted mb-2">
                        Decline this manuscript on substantive academic or ethical grounds. Written explanation is required.
                      </p>
                      <button
                        type="button"
                        className="btn-danger w-full"
                        onClick={() => setDecisionModal("reject")}
                      >
                        Reject Manuscript
                      </button>
                    </div>
                  </div>
                )}

                {details.status === "revision_requested" && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs">
                    <strong>Revisions in Progress:</strong> Authors have been notified of requested changes and must submit a revised manuscript before further action can be taken.
                  </div>
                )}

                {details.status === "accepted" && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-900 text-xs">
                    <strong>Accepted:</strong> This manuscript has been accepted by the faculty advisor and forwarded to the Library for cataloging and publication.
                  </div>
                )}

                {details.status === "rejected" && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-900 text-xs">
                    <strong>Rejected:</strong> This manuscript was rejected. Rejection is terminal and can only be reopened by an institutional administrator.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DECISION CONFIRMATION MODALS */}
      {decisionModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content max-w-lg">
            <div className="modal-header">
              <h3>
                {decisionModal === "accept" && "Accept Manuscript"}
                {decisionModal === "revisions" && "Request Manuscript Revisions"}
                {decisionModal === "reject" && "Reject Manuscript"}
              </h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setDecisionModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-form">
              {decisionModal === "accept" && (
                <div className="space-y-3 mb-3">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-950 text-xs leading-relaxed">
                    <strong className="block font-bold text-emerald-900 mb-1">Formal Endorsement Consequence:</strong>
                    The thesis status will transition to <strong>Accepted</strong>. The student author is notified immediately, and the manuscript is forwarded to the Library catalog for metadata checks, DOI assignment, and Open Access publication.
                  </div>
                  <p className="text-xs text-muted">
                    Confirm acceptance for: <strong>&ldquo;{details.title}&rdquo;</strong>
                  </p>
                </div>
              )}

              {decisionModal === "revisions" && (
                <div className="form-group mb-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-950 text-xs leading-relaxed mb-3">
                    <strong className="block font-bold text-amber-900 mb-1">Revision Loop Consequence:</strong>
                    The thesis status will transition to <strong>Revision Requested</strong>. The student author will receive these instructions and must upload Version {details.versions.length + 1} with change notes before review can proceed.
                  </div>
                  <label htmlFor="rev-reason">Revision Instructions / Feedback *</label>
                  <p className="text-xs text-muted mb-2">
                    Explain specifically what needs to be revised before resubmission (minimum 5 characters).
                  </p>
                  <textarea
                    id="rev-reason"
                    rows={4}
                    required
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    placeholder="e.g. Please revise Section 3.2 to include comparative benchmarking data and expand Chapter 5 discussion..."
                    className="form-textarea"
                  />
                </div>
              )}

              {decisionModal === "reject" && (
                <div className="form-group mb-3">
                  <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-950 text-xs leading-relaxed mb-3">
                    <strong className="block font-bold text-rose-900 mb-1">Terminal Action Warning:</strong>
                    Rejection is a <strong>terminal state</strong> and locks the thesis manuscript record. Only an institutional System Administrator can reopen a rejected thesis.
                  </div>
                  <label htmlFor="rej-reason">Grounds for Academic Rejection *</label>
                  <p className="text-xs text-muted mb-2">
                    A written academic rationale is required and recorded in the audit trail.
                  </p>
                  <textarea
                    id="rej-reason"
                    rows={4}
                    required
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    placeholder="e.g. Manuscript fails to demonstrate independent scientific rigor and does not meet institutional capstone standards..."
                    className="form-textarea"
                  />
                </div>
              )}

              <div className="modal-actions mt-4">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setDecisionModal(null)}
                  disabled={isSubmittingDecision}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={decisionModal === "reject" ? "btn-danger" : "btn-primary"}
                  disabled={
                    isSubmittingDecision ||
                    (decisionModal !== "accept" && decisionReason.trim().length < 5)
                  }
                  onClick={() => {
                    if (decisionModal === "accept") handleConfirmDecision("accept");
                    if (decisionModal === "revisions") handleConfirmDecision("request_revisions");
                    if (decisionModal === "reject") handleConfirmDecision("reject");
                  }}
                >
                  {isSubmittingDecision ? "Saving Decision..." : "Confirm Decision"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
