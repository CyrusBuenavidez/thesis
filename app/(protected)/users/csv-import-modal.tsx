"use client";

import Papa from "papaparse";
import { useState } from "react";

import {
  type CsvPreviewRow,
  parseAndValidateCsv,
  registerUser,
} from "@/app/(protected)/users/actions";

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CsvImportModal({ isOpen, onClose }: CsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreviewRow[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setImportStatus(null);

    Papa.parse<Record<string, string>>(selected, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const validated = await parseAndValidateCsv(results.data);
        setPreview(validated.preview);
        setValidCount(validated.validCount);
        setInvalidCount(validated.invalidCount);
      },
    });
  }

  async function handleConfirmImport() {
    setIsProcessing(true);
    setImportStatus("Importing valid accounts...");

    let successCount = 0;
    const validRows = preview.filter((r) => r.valid);

    for (const row of validRows) {
      const fd = new FormData();
      fd.append("full_name", row.fullName);
      fd.append("email", row.email);
      fd.append("role", row.role);
      fd.append("department", row.department);
      fd.append("program", row.program);
      fd.append("auth_mode", "password");
      fd.append("temporary_password", "PecitTemp2026!#");

      const res = await registerUser(fd);
      if (res.success) {
        successCount++;
      }
    }

    setIsProcessing(false);
    setImportStatus(
      `Import complete: successfully provisioned ${successCount} out of ${validRows.length} accounts.`,
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="csv-modal-title">
      <div className="modal-content max-w-3xl">
        <div className="modal-header">
          <h2 id="csv-modal-title">Bulk Import Users (CSV)</h2>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="text-sm text-muted mb-4">
          Upload a CSV file containing columns: <code>email</code>, <code>name</code>, <code>role</code>, <code>department</code>, <code>program</code>.
        </p>

        <div className="csv-upload-box mb-4">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            disabled={isProcessing}
          />
          {file && (
            <p className="text-xs text-muted mt-1">Selected: {file.name}</p>
          )}
        </div>

        {importStatus && (
          <div className="login-alert-success mb-4">{importStatus}</div>
        )}

        {preview.length > 0 && (
          <div className="dry-run-preview">
            <div className="dry-run-summary">
              <span className="badge-pass">Valid: {validCount}</span>
              {invalidCount > 0 && (
                <span className="badge-fail">Invalid: {invalidCount}</span>
              )}
            </div>

            <div className="preview-table-container">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 15).map((row) => (
                    <tr key={row.rowIndex} className={row.valid ? "" : "row-invalid"}>
                      <td>{row.rowIndex}</td>
                      <td>{row.email}</td>
                      <td>{row.fullName}</td>
                      <td>{row.role}</td>
                      <td>
                        {row.valid ? (
                          <span className="status-badge active">Valid</span>
                        ) : (
                          <span className="status-badge disabled" title={row.error}>
                            {row.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 15 && (
                <p className="text-xs text-muted mt-2">
                  Showing first 15 of {preview.length} rows.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="modal-actions mt-4">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isProcessing}>
            Close
          </button>
          {validCount > 0 && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirmImport}
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : `Import ${validCount} Accounts`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
