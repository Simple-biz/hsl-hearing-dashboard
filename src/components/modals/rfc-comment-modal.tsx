"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { Loader2, X } from "lucide-react";
import { getRfcComments, addRfcComment } from "@/app/(dashboard)/rfc/action";
import type { RfcEntry, RfcComment } from "@/app/(dashboard)/rfc/action";

export function RfcCommentModal({
  entry,
  onClose,
}: {
  entry: RfcEntry;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<RfcComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    const data = await getRfcComments(entry.id);
    startTransition(() => {
      setComments(data);
      setLoading(false);
    });
  }, [entry.id]);

  // Initial load + poll every 8s
  useEffect(() => {
    fetchComments();
    const interval = setInterval(fetchComments, 8000);
    return () => clearInterval(interval);
  }, [fetchComments]);

  async function handleAdd() {
    if (!newComment.trim()) return;
    setSaving(true);
    const res = await addRfcComment(entry.id, newComment);
    if (res.success) {
      setNewComment("");
      await fetchComments();
    }
    setSaving(false);
  }

  function fmtDate(d: string) {
    try {
      return new Date(d).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return d;
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[90vh] sm:max-h-[80vh] flex flex-col rounded-t-xl sm:rounded-xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <h2 className="text-sm font-semibold">💬 Comments</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        {/* Entry info */}
        <div className="px-5 py-3 border-b bg-muted/20 shrink-0">
          <p className="text-xs font-semibold text-foreground">
            {entry.client_name}
          </p>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
            {entry.hearing_date && (
              <span>
                Hearing:{" "}
                <span className="text-foreground">
                  {new Date(
                    entry.hearing_date + "T00:00:00",
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </span>
            )}
            {entry.document_type && (
              <span>
                Doc:{" "}
                <span className="text-foreground">{entry.document_type}</span>
              </span>
            )}
            <span className="text-muted-foreground/50">#{entry.id}</span>
          </div>
        </div>

        {/* Add comment */}
        <div className="px-5 py-3 border-b space-y-2 shrink-0">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Add a comment
          </label>
          <textarea
            autoFocus
            rows={3}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Type your comment here..."
            className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground resize-none focus:outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground">
              Ctrl+Enter to submit
            </span>
            <button
              onClick={handleAdd}
              disabled={saving || !newComment.trim()}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 size={11} className="animate-spin" />}
              Add Comment
            </button>
          </div>
        </div>

        {/* Comments history */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-12">
              No comments yet.
            </p>
          ) : (
            <div className="space-y-2">
              {comments.map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground">
                      {c.author}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {fmtDate(c.date)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {c.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-2.5 shrink-0 bg-muted/20">
          <span className="text-[10px] text-muted-foreground">
            {comments.length} comment{comments.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={onClose}
            className="text-xs px-4 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
