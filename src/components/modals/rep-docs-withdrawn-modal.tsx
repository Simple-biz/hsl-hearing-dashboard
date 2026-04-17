"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X as XIcon, Loader2, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  fetchRepDocsPage,
  type RepDocsRow,
} from "@/app/(dashboard)/representative-docs/actions";

export function RepDocsWithdrawnModal({ onClose }: { onClose: () => void }) {
  const [records, setRecords] = useState<RepDocsRow[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchRepDocsPage({ page: 1, pageSize: 500, status: "withdrawn" }).then(
      (res) => {
        if (!cancelled) setRecords(res.records);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (records ?? []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (r.claimant ?? "").toLowerCase().includes(q) ||
      (r.representative_name ?? "").toLowerCase().includes(q) ||
      (r.assigned_to ?? "").toLowerCase().includes(q)
    );
  });

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold">⚠️ Withdrawn Rep Docs</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {records === null
                ? "Loading..."
                : `${records.length} withdrawn record${records.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b px-5 py-2.5 shrink-0">
          <Input
            placeholder="Search claimant, rep, assignee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        <div className="flex-1 overflow-auto">
          {records === null ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No withdrawn records found.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/60 sticky top-0">
                <tr className="border-b">
                  <th className="text-left px-3 py-2 font-medium">Claimant</th>
                  <th className="text-left px-3 py-2 font-medium">Hearing Date</th>
                  <th className="text-left px-3 py-2 font-medium">Representative</th>
                  <th className="text-left px-3 py-2 font-medium">Assigned To</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2">
                      {r.claimant_link ? (
                        <a
                          href={r.claimant_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {r.claimant}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="font-medium">{r.claimant}</span>
                      )}
                      {r.claim_type && (
                        <div className="text-[10px] text-muted-foreground">
                          {r.claim_type}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {fmtDate(r.hearing_date)}
                    </td>
                    <td className="px-3 py-2">
                      {r.representative_name ?? "—"}
                      {r.rep_type && (
                        <div className="text-[10px] text-muted-foreground">
                          {r.rep_type}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.assigned_to ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
