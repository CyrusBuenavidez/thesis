"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "./thesis-management.css";

import {
  type StudentThesisCard,
  getMyTheses,
  updateThesisMetadata,
  removeThesisRecord,
  getThesisPreviewUrl,
} from "./actions";
import { SubmissionModal } from "./submission-modal";
import { ReviseModal } from "./revise-modal";

interface ThesisManagementClientProps {
  initialTheses: StudentThesisCard[];
  currentUserFullName: string;
}

type ManagementTab = "preview" | "modify" | "remove";

function formatSubmittedDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Jan 01, 2026";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Jan 01, 2026";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export function ThesisManagementClient({
  initialTheses,
  currentUserFullName,
}: ThesisManagementClientProps) {
  const router = useRouter();
  const [theses, setTheses] = useState<StudentThesisCard[]>(initialTheses);

  // Active top tab (Document Preview, Modify Record, Remove Record)
  const [activeTab, setActiveTab] = useState<ManagementTab>("preview");

  // Search & Pagination
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Row selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Notices
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const [errorNote, setErrorNote] = useState<string | null>(null);

  // Modals state
  const [previewThesis, setPreviewThesis] = useState<StudentThesisCard | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [isLoadingPreviewPdf, setIsLoadingPreviewPdf] = useState(false);

  const [modifyThesis, setModifyThesis] = useState<StudentThesisCard | null>(null);
  const [removeThesis, setRemoveThesis] = useState<StudentThesisCard | null>(null);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [revisingThesis, setRevisingThesis] = useState<StudentThesisCard | null>(null);

  // Form states for Modify
  const [metaTitle, setMetaTitle] = useState("");
  const [metaAbstract, setMetaAbstract] = useState("");
  const [metaDept, setMetaDept] = useState("");
  const [metaProg, setMetaProg] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");

  const [removeReason, setRemoveReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function triggerNotice(msg: string) {
    setSuccessNote(msg);
    setTimeout(() => setSuccessNote(null), 3500);
  }

  async function handleRefresh() {
    router.refresh();
    try {
      const fresh = await getMyTheses();
      setTheses(fresh);
      triggerNotice("Refreshed catalog records.");
    } catch {
      triggerNotice("Refreshed catalog records.");
    }
  }

  // Filtered dataset
  const filtered = theses.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.authorNames.some((a: string) => a.toLowerCase().includes(q)) ||
      (t.department && t.department.toLowerCase().includes(q)) ||
      (t.program && t.program.toLowerCase().includes(q)) ||
      t.keywords.some((k: string) => k.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const paginatedTheses = filtered.slice(
    (validPage - 1) * pageSize,
    validPage * pageSize,
  );

  // Selection handlers
  const isAllSelected = paginatedTheses.length > 0 && paginatedTheses.every((t) => selectedIds.has(t.id));

  function toggleSelectAll() {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      paginatedTheses.forEach((t) => next.add(t.id));
      setSelectedIds(next);
    }
  }

  function toggleSelectRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  // Row Action Click Handlers
  async function handlePreviewClick(item: StudentThesisCard) {
    setPreviewThesis(item);
    setPreviewPdfUrl(null);
    setIsLoadingPreviewPdf(true);
    try {
      const url = await getThesisPreviewUrl(item.id);
      setPreviewPdfUrl(url);
    } catch {
      setPreviewPdfUrl(null);
    } finally {
      setIsLoadingPreviewPdf(false);
    }
  }

  function handleModifyClick(item: StudentThesisCard) {
    setModifyThesis(item);
    setMetaTitle(item.title);
    setMetaAbstract(item.abstract);
    setMetaDept(item.department || "College of Engineering");
    setMetaProg(item.program || "BS Computer Engineering");
    setMetaKeywords((item.keywords || []).join(", "));
  }

  function handleRemoveClick(item: StudentThesisCard) {
    setRemoveThesis(item);
    setRemoveReason("");
  }

  // Save metadata modifications
  async function handleMetadataSave() {
    if (!modifyThesis) return;
    setIsSubmitting(true);
    setErrorNote(null);

    const keywords = metaKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const res = await updateThesisMetadata({
      thesisId: modifyThesis.id,
      title: metaTitle,
      abstract: metaAbstract,
      department: metaDept,
      program: metaProg,
      keywords,
    });

    setIsSubmitting(false);
    if (!res.success) {
      setErrorNote(res.error || "Failed to update metadata");
    } else {
      setTheses((prev) =>
        prev.map((t) =>
          t.id === modifyThesis.id
            ? {
                ...t,
                title: metaTitle,
                abstract: metaAbstract,
                department: metaDept,
                program: metaProg,
                keywords,
              }
            : t,
        ),
      );
      setModifyThesis(null);
      triggerNotice("Manuscript record updated successfully.");
    }
  }

  // Confirm removal / archive
  async function handleRemoveConfirm() {
    if (!removeThesis) return;
    setIsSubmitting(true);
    setErrorNote(null);

    const res = await removeThesisRecord(removeThesis.id, removeReason);
    setIsSubmitting(false);

    if (!res.success) {
      setErrorNote(res.error || "Failed to remove manuscript record");
    } else {
      setTheses((prev) =>
        removeThesis.status === "draft"
          ? prev.filter((t) => t.id !== removeThesis.id)
          : prev.map((t) => (t.id === removeThesis.id ? { ...t, status: "archived" } : t)),
      );
      setRemoveThesis(null);
      triggerNotice("Manuscript record removed/archived.");
    }
  }

  // Batch Archive Selected
  async function handleBatchArchive() {
    if (selectedIds.size === 0) return;
    setIsSubmitting(true);
    let successCount = 0;
    for (const id of Array.from(selectedIds)) {
      const res = await removeThesisRecord(id, "Batch archived from Thesis Management");
      if (res.success) successCount++;
    }
    setIsSubmitting(false);
    setTheses((prev) =>
      prev.map((t) => (selectedIds.has(t.id) ? { ...t, status: "archived" } : t)),
    );
    setSelectedIds(new Set());
    triggerNotice(`Archived ${successCount} manuscript records.`);
  }

  return (
    <div className="thesis-mgmt-wrapper">
      {/* 1. Breadcrumb Navigation: 🏠 / Thesis Management / [Tab Name] */}
      <nav className="thesis-mgmt-breadcrumb" aria-label="Breadcrumb">
        <Link href="/dashboard" className="breadcrumb-home-link" title="Dashboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </Link>
        <span className="breadcrumb-slash">/</span>
        <span className="breadcrumb-crumb">Thesis Management</span>
        <span className="breadcrumb-slash">/</span>
        <span className="breadcrumb-active">
          {activeTab === "preview" && "Document Preview"}
          {activeTab === "modify" && "Modify Record"}
          {activeTab === "remove" && "Remove Record"}
        </span>
      </nav>

      {/* 2. White Main Card Container */}
      <div className="thesis-mgmt-card">
        {/* Header: Title, Subtitle, Refresh & + Archive Buttons */}
        <header className="thesis-mgmt-header">
          <div className="thesis-mgmt-header-left">
            <h1 className="thesis-mgmt-title">Thesis Management</h1>
            <p className="thesis-mgmt-subtitle">Manage repository of theses and research papers</p>
          </div>
          <div className="thesis-mgmt-header-right">
            <button
              type="button"
              className="thesis-btn-icon-refresh"
              onClick={handleRefresh}
              title="Refresh Catalog"
              aria-label="Refresh"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
            </button>
            <button
              type="button"
              className="thesis-btn-archive"
              onClick={() => setIsSubmitOpen(true)}
            >
              <span className="text-lg leading-none">+</span>
              <span>Archive</span>
            </button>
          </div>
        </header>

        {/* Alerts / Feedback notices */}
        {successNote && <div className="login-alert-success">{successNote}</div>}
        {errorNote && <div className="login-alert-error">{errorNote}</div>}

        {/* 3. Search Bar */}
        <div className="thesis-mgmt-search-wrapper">
          <svg
            className="search-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search theses..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="thesis-mgmt-search-input"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCurrentPage(1);
              }}
              className="search-clear-btn"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* 4. Sub-Navigation Tabs */}
        <nav className="thesis-mgmt-tabs" aria-label="Management Modes">
          <button
            type="button"
            className={`thesis-mgmt-tab ${activeTab === "preview" ? "active" : ""}`}
            onClick={() => setActiveTab("preview")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Document Preview</span>
          </button>

          <button
            type="button"
            className={`thesis-mgmt-tab ${activeTab === "modify" ? "active" : ""}`}
            onClick={() => setActiveTab("modify")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
            <span>Modify Record</span>
          </button>

          <button
            type="button"
            className={`thesis-mgmt-tab ${activeTab === "remove" ? "active" : ""}`}
            onClick={() => setActiveTab("remove")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            <span>Remove Record</span>
          </button>
        </nav>

        {/* 5. Optional Batch Bar if checkboxes selected */}
        {selectedIds.size > 0 && (
          <div className="thesis-batch-bar">
            <span>
              <strong>{selectedIds.size}</strong> record{selectedIds.size > 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2">
              {activeTab === "remove" && (
                <button
                  type="button"
                  className="btn-danger btn-sm py-1 px-3"
                  onClick={handleBatchArchive}
                  disabled={isSubmitting}
                >
                  Archive Selected ({selectedIds.size})
                </button>
              )}
              <button
                type="button"
                className="text-xs text-blue-700 underline"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* 6. Main Table matching Reference Image */}
        <div className="thesis-table-container">
          <table className="thesis-mgmt-table">
            <thead>
              <tr>
                <th className="th-checkbox">
                  <div className="checkbox-select-all">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all rows"
                    />
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </th>
                <th className="th-action">Action</th>
                <th className="th-title">
                  <div className="th-title-header">
                    <span>Thesis Title</span>
                    <span className="th-sort-icons">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m7 15 5 5 5-5" />
                        <path d="m7 9 5-5 5-5" />
                      </svg>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                    </span>
                  </div>
                </th>
                <th className="th-status">Status</th>
                <th className="th-date">Submitted/Date</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTheses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    No thesis manuscripts match your search.
                  </td>
                </tr>
              ) : (
                paginatedTheses.map((item) => {
                  const isChecked = selectedIds.has(item.id);
                  const firstAuthor = item.authorNames[0] || currentUserFullName || "Author";
                  const affiliation = item.department || item.program || "College of Computer Studies";

                  return (
                    <tr key={item.id} className={isChecked ? "row-selected" : ""}>
                      {/* Checkbox */}
                      <td className="td-checkbox">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(item.id)}
                          aria-label={`Select ${item.title}`}
                        />
                      </td>

                      {/* Dynamic Action Button depending on Active Tab */}
                      <td className="td-action">
                        {activeTab === "preview" && (
                          <button
                            type="button"
                            className="thesis-action-pill-btn btn-preview"
                            onClick={() => handlePreviewClick(item)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            <span>Preview</span>
                          </button>
                        )}
                        {activeTab === "modify" && (
                          <button
                            type="button"
                            className="thesis-action-pill-btn btn-modify"
                            onClick={() => handleModifyClick(item)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              <path d="m15 5 4 4" />
                            </svg>
                            <span>Modify</span>
                          </button>
                        )}
                        {activeTab === "remove" && (
                          <button
                            type="button"
                            className="thesis-action-pill-btn btn-remove"
                            onClick={() => handleRemoveClick(item)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                            <span>Remove</span>
                          </button>
                        )}
                      </td>

                      {/* Thesis Title with Red/Coral Icon and Subtitle */}
                      <td className="td-title">
                        <div className="thesis-title-cell">
                          <div className="thesis-doc-icon-circle" aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <line x1="10" y1="9" x2="8" y2="9" />
                            </svg>
                          </div>
                          <div className="thesis-title-text-box">
                            <span className="thesis-main-title">{item.title}</span>
                            <span className="thesis-meta-sub">
                              {firstAuthor.toUpperCase()} • {affiliation.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Status Badge with Clock Icon */}
                      <td className="td-status">
                        <span className={`thesis-status-badge status-${item.status}`}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span>{item.status.replace("_", " ").toUpperCase()}</span>
                        </span>
                      </td>

                      {/* Submitted/Date with Calendar Icon */}
                      <td className="td-date">
                        <div className="thesis-date-cell">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          <span>{formatSubmittedDate(item.createdAt)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 7. Footer Pagination matching reference */}
        <div className="thesis-mgmt-footer">
          <div className="thesis-count-info">
            {filtered.length} {filtered.length === 1 ? "thesis" : "theses"} found
          </div>
          <div className="thesis-pagination-controls">
            <button
              type="button"
              disabled={validPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="thesis-page-nav-btn"
              aria-label="Previous page"
            >
              &lt;
            </button>
            <span className="thesis-page-current-badge">{validPage}</span>
            <button
              type="button"
              disabled={validPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="thesis-page-nav-btn"
              aria-label="Next page"
            >
              &gt;
            </button>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="thesis-page-size-select"
              aria-label="Theses per page"
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>
        </div>
      </div>

      {/* =========================================================================
          INTERACTIVE MODALS
         ========================================================================= */}

      {/* 1. Document Preview Modal */}
      {previewThesis && (
        <div className="thesis-modal-overlay" onClick={() => setPreviewThesis(null)}>
          <div
            className="thesis-modal-card"
            style={{ maxWidth: "800px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="thesis-modal-header">
              <h3 className="thesis-modal-title">Document Preview: {previewThesis.title}</h3>
              <button
                type="button"
                className="thesis-modal-close-btn"
                onClick={() => setPreviewThesis(null)}
              >
                ✕
              </button>
            </div>
            <div className="thesis-modal-body">
              <div className="mb-4 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="font-semibold text-slate-700">Authors: </span>
                    <span className="text-slate-600">{previewThesis.authorNames.join(", ")}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Department: </span>
                    <span className="text-slate-600">{previewThesis.department}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Program: </span>
                    <span className="text-slate-600">{previewThesis.program}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Status: </span>
                    <span className="uppercase font-semibold text-blue-700">{previewThesis.status}</span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="font-semibold text-slate-700 mb-0.5">Abstract:</p>
                  <p className="text-slate-600 italic leading-relaxed">{previewThesis.abstract}</p>
                </div>
              </div>

              {isLoadingPreviewPdf ? (
                <div className="py-16 text-center text-slate-400">Loading document preview...</div>
              ) : previewPdfUrl ? (
                <div className="border border-slate-200 rounded overflow-hidden">
                  <iframe
                    src={previewPdfUrl}
                    title="Manuscript PDF Viewer"
                    className="w-full h-[450px]"
                  />
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 bg-slate-50 border border-slate-200 rounded">
                  <p className="font-semibold text-slate-700 mb-1">Preview Notice</p>
                  <p className="text-xs text-slate-500">
                    Direct PDF stream not available or stored in local simulated mode.
                  </p>
                  <a
                    href={`/api/theses/${previewThesis.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary btn-sm mt-3 inline-block"
                  >
                    Download Manuscript
                  </a>
                </div>
              )}
            </div>
            <div className="thesis-modal-footer">
              {previewPdfUrl && (
                <a
                  href={previewPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary btn-sm py-1.5 px-3 text-xs"
                >
                  Open in New Window
                </a>
              )}
              <button
                type="button"
                className="btn-secondary btn-sm py-1.5 px-3 text-xs"
                onClick={() => setPreviewThesis(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modify Record Modal */}
      {modifyThesis && (
        <div className="thesis-modal-overlay" onClick={() => setModifyThesis(null)}>
          <div className="thesis-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="thesis-modal-header">
              <h3 className="thesis-modal-title">Modify Thesis Record</h3>
              <button
                type="button"
                className="thesis-modal-close-btn"
                onClick={() => setModifyThesis(null)}
              >
                ✕
              </button>
            </div>
            <div className="thesis-modal-body flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Manuscript Title
                </label>
                <input
                  type="text"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  className="form-input text-xs w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department / College
                </label>
                <input
                  type="text"
                  value={metaDept}
                  onChange={(e) => setMetaDept(e.target.value)}
                  className="form-input text-xs w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Academic Program
                </label>
                <input
                  type="text"
                  value={metaProg}
                  onChange={(e) => setMetaProg(e.target.value)}
                  className="form-input text-xs w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={metaKeywords}
                  onChange={(e) => setMetaKeywords(e.target.value)}
                  className="form-input text-xs w-full"
                  placeholder="e.g. AI, Telemetry, Signal Processing"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Abstract
                </label>
                <textarea
                  rows={4}
                  value={metaAbstract}
                  onChange={(e) => setMetaAbstract(e.target.value)}
                  className="form-input text-xs w-full"
                />
              </div>

              {modifyThesis.status === "revision_requested" && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs">
                  <span className="font-semibold text-amber-800">Revision requested by faculty: </span>
                  <p className="text-amber-700 mt-1">{modifyThesis.latestRemark || "Please revise manuscript per review."}</p>
                  <button
                    type="button"
                    className="btn-primary btn-sm mt-2"
                    onClick={() => {
                      const t = modifyThesis;
                      setModifyThesis(null);
                      setRevisingThesis(t);
                    }}
                  >
                    Upload Revised PDF
                  </button>
                </div>
              )}
            </div>
            <div className="thesis-modal-footer">
              <button
                type="button"
                className="btn-secondary btn-sm py-1.5 px-3 text-xs"
                onClick={() => setModifyThesis(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-sm py-1.5 px-4 text-xs"
                onClick={handleMetadataSave}
                disabled={isSubmitting || !metaTitle.trim()}
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Remove Record Modal */}
      {removeThesis && (
        <div className="thesis-modal-overlay" onClick={() => setRemoveThesis(null)}>
          <div className="thesis-modal-card" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="thesis-modal-header">
              <h3 className="thesis-modal-title text-rose-700">Remove / Archive Record</h3>
              <button
                type="button"
                className="thesis-modal-close-btn"
                onClick={() => setRemoveThesis(null)}
              >
                ✕
              </button>
            </div>
            <div className="thesis-modal-body flex flex-col gap-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to remove manuscript record{" "}
                <strong className="text-slate-900">{removeThesis.title}</strong>?
              </p>
              {removeThesis.status === "draft" ? (
                <p className="text-xs text-rose-600 font-medium">
                  This draft manuscript will be permanently deleted.
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  This thesis is in <strong>{removeThesis.status}</strong> state. Per institution archive policies, it will be moved to <strong>Archived</strong> status with audit trail preserved.
                </p>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for removal (optional)
                </label>
                <input
                  type="text"
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="e.g. Obsolete draft or author retraction"
                  className="form-input text-xs w-full"
                />
              </div>
            </div>
            <div className="thesis-modal-footer">
              <button
                type="button"
                className="btn-secondary btn-sm py-1.5 px-3 text-xs"
                onClick={() => setRemoveThesis(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger btn-sm py-1.5 px-4 text-xs"
                onClick={handleRemoveConfirm}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Removing..." : "Confirm Removal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Submission Modal for + Archive */}
      <SubmissionModal
        isOpen={isSubmitOpen}
        onClose={() => setIsSubmitOpen(false)}
        onSubmitted={() => {
          setIsSubmitOpen(false);
          handleRefresh();
        }}
        currentUserFullName={currentUserFullName}
      />

      {/* 5. Revise Modal */}
      <ReviseModal
        thesis={revisingThesis}
        isOpen={Boolean(revisingThesis)}
        onClose={() => setRevisingThesis(null)}
        onSubmitted={() => {
          setRevisingThesis(null);
          handleRefresh();
        }}
      />
    </div>
  );
}
