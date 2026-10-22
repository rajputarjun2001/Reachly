"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ModalShell } from "@/components/modals/modal-shell";
import type { LeadListSummary, LeadRow } from "@/lib/leads/types";
import { LEADS_PAGE_SIZE } from "@/lib/leads/constants";
import {
  deleteLeadAction,
  deleteLeadListAction,
  fetchLeadsForListAction,
  importLeadListCsvAction,
  renameLeadListAction,
  saveLeadAction,
} from "@/app/(app)/leads/actions";

const CSV_TEMPLATE = `linkedin_url,first_name,last_name,email,company,title
https://www.linkedin.com/in/example/,Jane,Doe,jane@example.com,Acme Inc,Head of Sales`;

type UploadModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function UploadLeadsModal({ open, onClose, onSuccess }: UploadModalProps) {
  const [listName, setListName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setListName("");
      setFile(null);
      setMessage(null);
    }
  }, [open]);

  const onSubmit = () => {
    if (!file || !listName.trim()) {
      setMessage({ type: "error", text: "List name and CSV file are required." });
      return;
    }
    const formData = new FormData();
    formData.set("listName", listName);
    formData.set("file", file);
    startTransition(async () => {
      const result = await importLeadListCsvAction(formData);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "success", text: result.success ?? "Import complete." });
      onSuccess();
      setTimeout(() => onClose(), 1200);
    });
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Upload Lead List"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={pending}>
            {pending ? "Importing…" : "Upload & Import"}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label" htmlFor="live-list-name">List Name</label>
        <input
          id="live-list-name"
          className="form-input"
          placeholder="e.g. SaaS Founders Q4"
          value={listName}
          onChange={(e) => setListName(e.target.value)}
        />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div
        className="upload-zone"
        style={{ marginBottom: 12 }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <div className="upload-icon">📄</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", marginBottom: 4 }}>
          {file ? file.name : "Drop CSV here or click to browse"}
        </div>
        <div style={{ fontSize: 12, color: "var(--fg2)" }}>
          Required column: <code>linkedin_url</code>. Optional: <code>first_name</code>,{" "}
          <code>last_name</code>, <code>email</code>, <code>company</code>, <code>title</code>
        </div>
      </div>
      <button
        type="button"
        style={{ fontSize: 12.5, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        onClick={() => {
          const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "reachly-leads-template.csv";
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        📥 Download CSV template
      </button>
      {message && (
        <p
          className="form-hint"
          style={{
            marginTop: 12,
            color: message.type === "error" ? "var(--red)" : "var(--green)",
          }}
        >
          {message.text}
        </p>
      )}
    </ModalShell>
  );
}

function leadDisplayName(lead: LeadRow) {
  const parts = [lead.first_name, lead.last_name].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return lead.email ?? "—";
}

type LeadDetailModalProps = {
  list: LeadListSummary | null;
  open: boolean;
  onClose: () => void;
  onListChanged: () => void;
};

export function LeadDetailModal({ list, open, onClose, onListChanged }: LeadDetailModalProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    if (!list) return;
    startTransition(async () => {
      const result = await fetchLeadsForListAction(list.id, search, page);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setRows(result.leads?.leads ?? []);
      setTotal(result.leads?.total ?? 0);
    });
  }, [list, search, page]);

  useEffect(() => {
    if (open && list) load();
  }, [open, list, load]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setPage(1);
      setRows([]);
      setTotal(0);
      setError(null);
    }
  }, [open]);

  const pageCount = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));

  const onRenameList = () => {
    if (!list) return;
    const name = window.prompt("Rename list", list.name);
    if (!name || name.trim() === list.name) return;
    startTransition(async () => {
      const result = await renameLeadListAction(list.id, name);
      if (result.error) setError(result.error);
      else onListChanged();
    });
  };

  const onDeleteList = () => {
    if (!list) return;
    if (!window.confirm(`Delete "${list.name}"? Leads in this list will be unassigned, not deleted.`)) return;
    startTransition(async () => {
      const result = await deleteLeadListAction(list.id);
      if (result.error) setError(result.error);
      else {
        onListChanged();
        onClose();
      }
    });
  };

  const onDeleteLead = (leadId: string) => {
    if (!window.confirm("Delete this lead permanently?")) return;
    startTransition(async () => {
      const result = await deleteLeadAction(leadId);
      if (result.error) setError(result.error);
      else load();
    });
  };

  const onEditLead = (lead: LeadRow) => {
    const first = window.prompt("First name", lead.first_name ?? "") ?? lead.first_name;
    const last = window.prompt("Last name", lead.last_name ?? "") ?? lead.last_name;
    const formData = new FormData();
    formData.set("first_name", first ?? "");
    formData.set("last_name", last ?? "");
    formData.set("email", lead.email ?? "");
    formData.set("company", lead.company ?? "");
    formData.set("job_title", lead.job_title ?? "");
    formData.set("linkedin_url", lead.linkedin_url ?? "");
    formData.set("lead_list_id", list?.id ?? "");
    startTransition(async () => {
      const result = await saveLeadAction(lead.id, formData);
      if (result.error) setError(result.error);
      else load();
    });
  };

  if (!list) return null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={`${list.name} · ${total} Leads`}
      size="lg"
      footer={
        <div className="flex-between" style={{ width: "100%", gap: 12 }}>
          <div className="flex" style={{ gap: 8 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={onRenameList} disabled={pending}>
              Rename list
            </button>
            <button type="button" className="btn btn-outline btn-sm danger" onClick={onDeleteList} disabled={pending}>
              Delete list
            </button>
          </div>
          <div className="flex" style={{ gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={page <= 1 || pending}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="text-xs color-muted">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={page >= pageCount || pending}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      }
    >
      <div className="form-group" style={{ marginBottom: 12 }}>
        <input
          className="form-input"
          placeholder="Search leads…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {error && <p className="form-hint" style={{ color: "var(--red)" }}>{error}</p>}
      {pending && rows.length === 0 ? (
        <p className="color-muted text-sm">Loading leads…</p>
      ) : rows.length === 0 ? (
        <p className="color-muted text-sm" style={{ padding: "24px 0", textAlign: "center" }}>
          No leads in this list yet. Upload a CSV or add leads from another import.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Title</th>
                <th>Source</th>
                <th>LinkedIn</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id}>
                  <td className="td-main">{leadDisplayName(lead)}</td>
                  <td>{lead.company ?? "—"}</td>
                  <td>{lead.job_title ?? "—"}</td>
                  <td><span className="badge badge-gray">{lead.source}</span></td>
                  <td>
                    {lead.linkedin_url ? (
                      <a
                        href={lead.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--primary)", fontSize: 12 }}
                      >
                        View →
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => onEditLead(lead)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm danger"
                      style={{ marginLeft: 6 }}
                      onClick={() => onDeleteLead(lead.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  );
}
