"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/dropdown";
import type { LeadListSummary } from "@/lib/leads/types";
import { LeadDetailModal, UploadLeadsModal } from "@/components/leads/leads-modals";
import {
  deleteLeadListAction,
  renameLeadListAction,
} from "@/app/(app)/leads/actions";
function formatListDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
  } catch {
    return "";
  }
}

type LeadsLiveViewProps = {
  initialLists: LeadListSummary[];
};

export function LeadsLiveView({ initialLists }: LeadsLiveViewProps) {
  const router = useRouter();
  const [lists, setLists] = useState(initialLists);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailList, setDetailList] = useState<LeadListSummary | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setLists(initialLists);
  }, [initialLists]);

  const totalLeads = lists.reduce((sum, l) => sum + l.lead_count, 0);

  const onListsChanged = () => {
    router.refresh();
  };

  const handleRename = (list: LeadListSummary) => {
    const name = window.prompt("Rename list", list.name);
    if (!name || name.trim() === list.name) return;
    startTransition(async () => {
      const result = await renameLeadListAction(list.id, name);
      if (!result.error) {
        setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, name: name.trim() } : l)));
        router.refresh();
      }
    });
  };

  const handleDelete = (list: LeadListSummary) => {
    if (!window.confirm(`Delete "${list.name}"? This removes the list; leads are kept in the workspace.`)) return;
    startTransition(async () => {
      const result = await deleteLeadListAction(list.id);
      if (!result.error) {
        setLists((prev) => prev.filter((l) => l.id !== list.id));
        router.refresh();
      }
    });
  };

  if (lists.length === 0) {
    return (
      <>
        <div className="header">
          <div>
            <div className="header-title">Lead Lists</div>
            <div className="header-sub">No lists uploaded yet</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setUploadOpen(true)}>
            ＋ Upload CSV
          </button>
        </div>
        <div className="content">
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 0" }}>
            <div className="card">
              <div className="card-body">
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Upload your first lead list</div>
                  <div style={{ fontSize: 13, color: "var(--fg2)" }}>
                    A CSV with LinkedIn profile URLs. Stored securely in your workspace.
                  </div>
                </div>
                <div
                  className="upload-zone"
                  onClick={() => setUploadOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setUploadOpen(true)}
                >
                  <div className="upload-icon">📤</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>
                    Drop your CSV here or click to browse
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg2)" }}>
                    Required column: <code>linkedin_url</code> — everything else is optional
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <UploadLeadsModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onSuccess={() => {
            router.refresh();
            setUploadOpen(false);
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">Lead Lists</div>
          <div className="header-sub">
            {lists.length} list{lists.length === 1 ? "" : "s"} · {totalLeads} total leads
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setUploadOpen(true)} disabled={pending}>
          ＋ Upload CSV
        </button>
      </div>
      <div className="content">
        <div className="grid-3 mb-24">
          {lists.map((list) => (
            <div
              key={list.id}
              className="card"
              style={{ cursor: "pointer" }}
              onClick={() => setDetailList(list)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setDetailList(list)}
            >
              <div className="card-body">
                <div className="flex-between mb-16">
                  <div style={{ fontSize: 18 }}>👥</div>
                  <Dropdown
                    trigger={
                      <button
                        type="button"
                        className="dots-btn"
                        onClick={(e) => e.stopPropagation()}
                      >
                        •••
                      </button>
                    }
                  >
                    <div className="dd-item" onClick={() => handleRename(list)}>✏️ Rename</div>
                    <div className="dd-sep" />
                    <div className="dd-item danger" onClick={() => handleDelete(list)}>🗑 Delete List</div>
                  </Dropdown>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{list.name}</div>
                <div className="text-xs color-muted mb-16">
                  Created {formatListDate(list.created_at)} · {list.lead_count} leads
                </div>
                <div className="flex-between text-xs">
                  <div>
                    <span className="color-primary fw-700">{list.lead_count}</span>{" "}
                    <span className="color-muted">in list</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div
            className="card"
            style={{ border: "2px dashed var(--border)", boxShadow: "none", cursor: "pointer" }}
            onClick={() => setUploadOpen(true)}
            role="button"
            tabIndex={0}
          >
            <div
              className="card-body"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 130,
                gap: 8,
              }}
            >
              <div style={{ fontSize: 30 }}>📤</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg2)" }}>Upload New List</div>
              <div style={{ fontSize: 11.5, color: "var(--fg3)" }}>CSV with linkedin_url column</div>
            </div>
          </div>
        </div>
      </div>
      <UploadLeadsModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          router.refresh();
          setUploadOpen(false);
        }}
      />
      <LeadDetailModal
        list={detailList}
        open={detailList !== null}
        onClose={() => setDetailList(null)}
        onListChanged={onListsChanged}
      />
    </>
  );
}
