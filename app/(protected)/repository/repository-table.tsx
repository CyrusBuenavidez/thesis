"use client";

import { useEffect, useState } from "react";
import {
  type ManagementThesisItem,
  type ActivityLogEntry,
  assignThesisAdvisor,
  assignThesisDoi,
  getEligibleAdvisorsList,
  getThesisActivityLogs,
  publishThesis,
  archiveThesis,
  updateConfidentialityAndEmbargo,
  updateThesisMetadata,
} from "./actions";

interface RepositoryTableProps {
  initialTheses: ManagementThesisItem[];
  initialAdvisors?: { id: string; fullName: string; email: string; department: string | null }[];
}

export function RepositoryTable({ initialTheses, initialAdvisors = [] }: RepositoryTableProps) {
  const [theses, setTheses] = useState<ManagementThesisItem[]>(initialTheses);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  // Roster of faculty advisors (preloaded from server)
  const [advisors, setAdvisors] = useState<
    { id: string; fullName: string; email: string; department: string | null }[]
  >(initialAdvisors);

  // Modals state
  const [activeModal, setActiveModal] = useState<
    "assign_advisor" | "metadata" | "confidentiality" | "doi" | "audit" | null
  >(null);
  const [selectedThesis, setSelectedThesis] = useState<ManagementThesisItem | null>(null);

  // Form states for modals
  const [selectedAdvisorId, setSelectedAdvisorId] = useState("");
  const [advisorReason, setAdvisorReason] = useState("");

  const [metaTitle, setMetaTitle] = useState("");
  const [metaAbstract, setMetaAbstract] = useState("");
  const [metaDept, setMetaDept] = useState("");
  const [metaProg, setMetaProg] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");

  const [isConfidential, setIsConfidential] = useState(false);
  const [embargoDate, setEmbargoDate] = useState("");

  const [doiInput, setDoiInput] = useState("");

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<ActivityLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Status & error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);


  function triggerNotice(msg: string) {
    setSuccessNote(msg);
    setTimeout(() => setSuccessNote(null), 3000);
  }

  // Filter items
  const filtered = theses.filter((t) => {
    const matchSearch =
      search === "" ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.authors.some((a) => a.toLowerCase().includes(search.toLowerCase())) ||
      (t.doi && t.doi.toLowerCase().includes(search.toLowerCase()));

    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchDept = departmentFilter === "all" || t.department === departmentFilter;

    return matchSearch && matchStatus && matchDept;
  });

  // Modal Open Handlers
  function openAdvisorModal(item: ManagementThesisItem) {
    setSelectedThesis(item);
    setSelectedAdvisorId(item.primarySupervisorId || "");
    setAdvisorReason("");
    setError(null);
    setActiveModal("assign_advisor");
  }

  function openMetadataModal(item: ManagementThesisItem) {
    setSelectedThesis(item);
    setMetaTitle(item.title);
    setMetaAbstract(item.abstract);
    setMetaDept(item.department);
    setMetaProg(item.program);
    setMetaKeywords(item.keywords.join(", "));
    setError(null);
    setActiveModal("metadata");
  }

  function openConfidentialityModal(item: ManagementThesisItem) {
    setSelectedThesis(item);
    setIsConfidential(item.isConfidential);
    setEmbargoDate(item.embargoUntil ? item.embargoUntil.split("T")[0] : "");
    setError(null);
    setActiveModal("confidentiality");
  }

  function openDoiModal(item: ManagementThesisItem) {
    setSelectedThesis(item);
    setDoiInput(item.doi || "");
    setError(null);
    setActiveModal("doi");
  }

  async function openAuditModal(item: ManagementThesisItem) {
    setSelectedThesis(item);
    setActiveModal("audit");
    setIsLoadingAudit(true);
    setError(null);
    try {
      const logs = await getThesisActivityLogs(item.id);
      setAuditLogs(logs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoadingAudit(false);
    }
  }

  // Action Submit Handlers
  async function handleAssignAdvisorSubmit() {
    if (!selectedThesis || !selectedAdvisorId) return;
    setIsSubmitting(true);
    setError(null);

    const res = await assignThesisAdvisor(
      selectedThesis.id,
      selectedAdvisorId,
      advisorReason,
    );
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || "Failed to assign advisor");
    } else {
      const advisor = advisors.find((a) => a.id === selectedAdvisorId);
      setTheses((prev) =>
        prev.map((t) =>
          t.id === selectedThesis.id
            ? {
                ...t,
                primarySupervisorId: selectedAdvisorId,
                supervisorName: advisor?.fullName ?? null,
              }
            : t,
        ),
      );
      setActiveModal(null);
      triggerNotice("Primary advisor successfully assigned.");
    }
  }

  async function handleMetadataSubmit() {
    if (!selectedThesis) return;
    setIsSubmitting(true);
    setError(null);

    const keywords = metaKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const res = await updateThesisMetadata({
      thesisId: selectedThesis.id,
      title: metaTitle,
      abstract: metaAbstract,
      department: metaDept,
      program: metaProg,
      keywords,
    });
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || "Failed to update metadata");
    } else {
      setTheses((prev) =>
        prev.map((t) =>
          t.id === selectedThesis.id
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
      setActiveModal(null);
      triggerNotice("Thesis metadata successfully updated.");
    }
  }

  async function handleConfidentialitySubmit() {
    if (!selectedThesis) return;
    setIsSubmitting(true);
    setError(null);

    const res = await updateConfidentialityAndEmbargo(selectedThesis.id, {
      isConfidential,
      embargoUntil: embargoDate || null,
    });
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || "Failed to update confidentiality/embargo");
    } else {
      setTheses((prev) =>
        prev.map((t) =>
          t.id === selectedThesis.id
            ? { ...t, isConfidential, embargoUntil: embargoDate || null }
            : t,
        ),
      );
      setActiveModal(null);
      triggerNotice("Confidentiality and embargo settings updated.");
    }
  }

  async function handleDoiSubmit() {
    if (!selectedThesis) return;
    setIsSubmitting(true);
    setError(null);

    const res = await assignThesisDoi(selectedThesis.id, doiInput);
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || "Failed to assign DOI");
    } else {
      setTheses((prev) =>
        prev.map((t) =>
          t.id === selectedThesis.id ? { ...t, doi: doiInput.trim() } : t,
        ),
      );
      setActiveModal(null);
      triggerNotice("DOI successfully registered for manuscript.");
    }
  }

  async function handlePublishClick(item: ManagementThesisItem) {
    if (!confirm(`Publish "${item.title}" to the Institutional Archive?`)) return;
    setError(null);

    const res = await publishThesis(item.id);
    if (!res.success) {
      setError(res.error || "Failed to publish thesis");
    } else {
      setTheses((prev) =>
        prev.map((t) => (t.id === item.id ? { ...t, status: "published" } : t)),
      );
      triggerNotice(`"${item.title}" is now published.`);
    }
  }

  async function handleArchiveClick(item: ManagementThesisItem) {
    if (!confirm(`Archive "${item.title}"?`)) return;
    setError(null);

    const res = await archiveThesis(item.id);
    if (!res.success) {
      setError(res.error || "Failed to archive thesis");
    } else {
      setTheses((prev) =>
        prev.map((t) => (t.id === item.id ? { ...t, status: "archived" } : t)),
      );
      triggerNotice(`"${item.title}" has been moved to Archive.`);
    }
  }

  const unassignedCount = theses.filter((t) => !t.primarySupervisorId && t.status !== "draft").length;
  const readyToPublishCount = theses.filter((t) => t.status === "accepted").length;
  const publishedCount = theses.filter((t) => t.status === "published").length;
  const confidentialCount = theses.filter((t) => t.isConfidential || t.embargoUntil).length;

  return (
    <div className="repository-view">
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title text-2xl font-bold">Repository</h1>
          <p className="text-sm text-muted">
            Institutional Librarian workbench for advisor assignment, metadata curation, confidentiality control, DOI registration, and repository publication.
          </p>
        </div>
      </div>

      {successNote && <div className="login-alert-success mb-4">{successNote}</div>}
      {error && <div className="login-alert-error mb-4">{error}</div>}

      {/* KPI Stats */}
      <div className="queue-stats-grid mb-6">
        <div className="stat-card">
          <span className="stat-label">Unassigned</span>
          <span className="stat-number text-amber-600">{unassignedCount}</span>
          <span className="stat-desc">Awaiting Advisor Assignment</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Ready to Publish</span>
          <span className="stat-number text-blue-600">{readyToPublishCount}</span>
          <span className="stat-desc">Accepted by Advisors</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Published</span>
          <span className="stat-number text-emerald-600">{publishedCount}</span>
          <span className="stat-desc">In Public Archive</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Protected</span>
          <span className="stat-number text-purple-600">{confidentialCount}</span>
          <span className="stat-desc">Confidential / Embargoed</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="queue-toolbar mb-4 flex-wrap gap-3">
        <div className="flex-1 min-w-[280px]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author, or DOI..."
            className="form-input"
          />
        </div>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="form-input w-56 text-xs"
        >
          <option value="all">All Departments</option>
          <option value="College of Engineering">College of Engineering</option>
          <option value="College of Computer Studies">College of Computer Studies</option>
          <option value="College of Business and Management">College of Business and Management</option>
          <option value="College of Education">College of Education</option>
        </select>

        <div className="filter-pill-group">
          {["all", "submitted", "under_review", "accepted", "published", "archived"].map((st) => (
            <button
              key={st}
              type="button"
              className={`filter-pill ${statusFilter === st ? "active" : ""}`}
              onClick={() => setStatusFilter(st)}
            >
              {st === "all" ? "All" : st.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      {filtered.length === 0 ? (
        <div className="empty-state-box">
          <div className="empty-state-icon">📚</div>
          <h3>No records match criteria</h3>
          <p className="text-muted text-sm">
            Try adjusting your search terms or status filters.
          </p>
        </div>
      ) : (
        <div className="queue-table-container">
          <table className="queue-table">
            <thead>
              <tr>
                <th>Title & Authors</th>
                <th>Department / Program</th>
                <th>Assigned Advisor</th>
                <th>Status</th>
                <th>DOI / Rights</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="queue-table-row">
                  <td className="max-w-md">
                    <strong className="text-ink line-clamp-2">{item.title}</strong>
                    <span className="text-xs text-muted block mt-0.5">
                      {item.authors.join(", ") || "Unknown Author"}
                    </span>
                  </td>
                  <td className="text-xs">
                    <div>{item.department}</div>
                    <div className="text-muted">{item.program}</div>
                  </td>
                  <td className="text-xs">
                    {item.supervisorName ? (
                      <span className="advisor-tag font-semibold text-ink">
                        {item.supervisorName}
                      </span>
                    ) : (
                      <span className="text-amber-600 font-medium">Unassigned</span>
                    )}
                    <button
                      type="button"
                      className="text-primary text-xs underline block mt-1"
                      onClick={() => openAdvisorModal(item)}
                    >
                      {item.supervisorName ? "Reassign" : "+ Assign Advisor"}
                    </button>
                  </td>
                  <td>
                    <span className={`status-badge status-${item.status}`}>
                      {item.status.replace("_", " ")}
                    </span>
                    {item.isConfidential && (
                      <span className="lock-badge block mt-1">🔒 Confidential</span>
                    )}
                    {item.embargoUntil && (
                      <span className="embargo-badge block mt-1">
                        ⏳ Embargo {new Date(item.embargoUntil).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td className="text-xs">
                    {item.doi ? (
                      <span className="font-mono text-xs text-blue-700 block truncate max-w-[140px]" title={item.doi}>
                        {item.doi}
                      </span>
                    ) : (
                      <span className="text-muted block">No DOI</span>
                    )}
                    <button
                      type="button"
                      className="text-xs text-muted underline"
                      onClick={() => openDoiModal(item)}
                    >
                      {item.doi ? "Edit DOI" : "+ Add DOI"}
                    </button>
                  </td>
                  <td>
                    <div className="flex flex-col gap-1 text-xs">
                      {item.status === "accepted" && (
                        <button
                          type="button"
                          className="btn-primary btn-sm py-1"
                          onClick={() => handlePublishClick(item)}
                        >
                          Publish
                        </button>
                      )}

                      {item.status === "published" && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm py-1"
                          onClick={() => handleArchiveClick(item)}
                        >
                          Archive
                        </button>
                      )}

                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          className="text-primary underline text-xs"
                          onClick={() => openMetadataModal(item)}
                        >
                          Metadata
                        </button>
                        <span className="text-muted">•</span>
                        <button
                          type="button"
                          className="text-primary underline text-xs"
                          onClick={() => openConfidentialityModal(item)}
                        >
                          Embargo
                        </button>
                        <span className="text-muted">•</span>
                        <button
                          type="button"
                          className="text-muted underline text-xs"
                          onClick={() => openAuditModal(item)}
                        >
                          Audit
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 1. ASSIGN ADVISOR MODAL */}
      {activeModal === "assign_advisor" && selectedThesis && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content max-w-lg">
            <div className="modal-header">
              <h3>Assign Faculty Advisor</h3>
              <button type="button" className="close-btn" onClick={() => setActiveModal(null)}>
                ✕
              </button>
            </div>
            <div className="modal-form">
              <p className="text-xs text-muted mb-3">
                Assign an authorized faculty member to supervise and review: <strong>{selectedThesis.title}</strong>
              </p>
              <div className="form-group mb-3">
                <label htmlFor="select-advisor">Select Faculty Advisor *</label>
                <select
                  id="select-advisor"
                  required
                  value={selectedAdvisorId}
                  onChange={(e) => setSelectedAdvisorId(e.target.value)}
                  className="form-input"
                >
                  <option value="">-- Choose Advisor --</option>
                  {advisors.map((adv) => (
                    <option key={adv.id} value={adv.id}>
                      {adv.fullName} ({adv.email}) {adv.department ? `[${adv.department}]` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group mb-3">
                <label htmlFor="advisor-reason">Assignment Note / Reason (Optional)</label>
                <input
                  id="advisor-reason"
                  value={advisorReason}
                  onChange={(e) => setAdvisorReason(e.target.value)}
                  placeholder="e.g. Assigned per Department Chair recommendation"
                  className="form-input text-xs"
                />
              </div>

              <div className="modal-actions mt-4">
                <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleAssignAdvisorSubmit}
                  disabled={!selectedAdvisorId || isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Confirm Assignment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. METADATA MODAL */}
      {activeModal === "metadata" && selectedThesis && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content max-w-2xl">
            <div className="modal-header">
              <h3>Curate Thesis Metadata</h3>
              <button type="button" className="close-btn" onClick={() => setActiveModal(null)}>
                ✕
              </button>
            </div>
            <div className="modal-form">
              <div className="form-group mb-3">
                <label htmlFor="meta-title">Manuscript Title *</label>
                <input
                  id="meta-title"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  className="form-input font-medium"
                />
              </div>

              <div className="form-group mb-3">
                <label htmlFor="meta-abstract">Abstract *</label>
                <textarea
                  id="meta-abstract"
                  rows={5}
                  value={metaAbstract}
                  onChange={(e) => setMetaAbstract(e.target.value)}
                  className="form-textarea"
                />
              </div>

              <div className="form-row mb-3">
                <div className="form-group flex-1">
                  <label htmlFor="meta-dept">Department *</label>
                  <input
                    id="meta-dept"
                    value={metaDept}
                    onChange={(e) => setMetaDept(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group flex-1">
                  <label htmlFor="meta-prog">Program *</label>
                  <input
                    id="meta-prog"
                    value={metaProg}
                    onChange={(e) => setMetaProg(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group mb-3">
                <label htmlFor="meta-keywords">Keywords (comma-separated) *</label>
                <input
                  id="meta-keywords"
                  value={metaKeywords}
                  onChange={(e) => setMetaKeywords(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="modal-actions mt-4">
                <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleMetadataSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save Metadata"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. CONFIDENTIALITY & EMBARGO MODAL */}
      {activeModal === "confidentiality" && selectedThesis && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content max-w-lg">
            <div className="modal-header">
              <h3>Confidentiality & Embargo Settings</h3>
              <button type="button" className="close-btn" onClick={() => setActiveModal(null)}>
                ✕
              </button>
            </div>
            <div className="modal-form">
              <p className="text-xs text-muted mb-3">
                Confidential or embargoed theses are excluded from public search and downloads until the embargo expires or restriction is lifted.
              </p>

              <div className="form-group checkbox-group mb-4">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isConfidential}
                    onChange={(e) => setIsConfidential(e.target.checked)}
                  />
                  <span>
                    <strong>Mark as Confidential Manuscript</strong> (Contains non-disclosure intellectual property or commercial patents)
                  </span>
                </label>
              </div>

              <div className="form-group mb-4">
                <label htmlFor="embargo-date">Embargo Expiration Date</label>
                <input
                  id="embargo-date"
                  type="date"
                  value={embargoDate}
                  onChange={(e) => setEmbargoDate(e.target.value)}
                  className="form-input"
                />
                <span className="text-xs text-muted mt-1 block">
                  Leave empty if manuscript has no active embargo.
                </span>
              </div>

              <div className="modal-actions mt-4">
                <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfidentialitySubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Update Settings"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. DOI MODAL */}
      {activeModal === "doi" && selectedThesis && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3>Register Digital Object Identifier (DOI)</h3>
              <button type="button" className="close-btn" onClick={() => setActiveModal(null)}>
                ✕
              </button>
            </div>
            <div className="modal-form">
              <div className="form-group mb-3">
                <label htmlFor="doi-string">Institutional DOI String *</label>
                <input
                  id="doi-string"
                  value={doiInput}
                  onChange={(e) => setDoiInput(e.target.value)}
                  placeholder="e.g. 10.5281/zenodo.pecit.2026.001"
                  className="form-input font-mono text-xs"
                />
                <span className="text-xs text-muted mt-1 block">
                  Assigning a persistent DOI allows citation aggregators and Google Scholar to reference this work.
                </span>
              </div>

              <div className="modal-actions mt-4">
                <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleDoiSubmit}
                  disabled={isSubmitting || !doiInput.trim()}
                >
                  {isSubmitting ? "Saving..." : "Register DOI"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. AUDIT TRAIL MODAL / DRAWER */}
      {activeModal === "audit" && selectedThesis && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-content max-w-2xl max-h-[85vh] flex flex-col">
            <div className="modal-header">
              <div>
                <h3>Immutable Audit Trail (activity_logs)</h3>
                <p className="text-xs text-muted truncate max-w-md">{selectedThesis.title}</p>
              </div>
              <button type="button" className="close-btn" onClick={() => setActiveModal(null)}>
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {isLoadingAudit ? (
                <p className="text-xs text-muted text-center py-8">Loading audit trail...</p>
              ) : auditLogs.length === 0 ? (
                <p className="text-xs text-muted text-center py-8 italic">No audit log records recorded yet.</p>
              ) : (
                <div className="audit-timeline">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="audit-timeline-item">
                      <div className="audit-dot" />
                      <div className="audit-body">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-semibold text-ink">
                            {log.action.replace("_", " ").toUpperCase()}
                          </strong>
                          <span className="text-xs text-muted">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted mt-0.5">
                          Actor: <strong>{log.actorName}</strong>
                          {log.fromStatus && log.toStatus && (
                            <span> ({log.fromStatus} → {log.toStatus})</span>
                          )}
                        </p>
                        {log.reason && (
                          <div className="audit-reason-box mt-1 text-xs">
                            Reason: &ldquo;{log.reason}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-muted/10 border-t border-border flex justify-end">
              <button type="button" className="btn-secondary btn-sm" onClick={() => setActiveModal(null)}>
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { RepositoryTable as RepositoryClient };
