"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, MessageSquare, Trash } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  addRepDocsNote,
  deleteRepDocsNote,
  type RepDocsRow,
  type RepDocsNoteEntry,
} from "./actions";
import { toast } from "sonner";

interface Props {
  row: RepDocsRow | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onSaved: (id: number, notes: RepDocsNoteEntry[]) => void;
  userName: string;
}

function parseNotes(raw: unknown): RepDocsNoteEntry[] {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : (() => {
        try {
          return JSON.parse(String(raw));
        } catch {
          return [];
        }
      })();
  if (!Array.isArray(arr)) return [];
  return arr.map((item: Record<string, unknown>) => ({
    user: String(item.user ?? "Unknown"),
    date: String(item.date ?? ""),
    note: String(item.note ?? ""),
  }));
}

export function RepDocsNotesPanel({
  row,
  anchorRect,
  onClose,
  onSaved,
  userName,
}: Props) {
  const [notes, setNotes] = useState<RepDocsNoteEntry[]>([]);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync notes when row changes
  useEffect(() => {
    if (!row) return;
    setNotes(parseNotes(row.notes));
    setNewNote("");
    const timer = setTimeout(() => textareaRef.current?.focus(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose]);

  const handleAddNote = useCallback(async () => {
    if (!row || !newNote.trim()) return;
    setSaving(true);
    try {
      const trimmed = newNote.trim();
      const r = await addRepDocsNote(row.id, trimmed, userName);
      if (r.success && r.notes) {
        setNotes(r.notes);
        onSaved(row.id, r.notes);
        setNewNote("");
        toast.success("Note added");
      }
    } catch {
      toast.error("Failed to add note");
    }
    setSaving(false);
  }, [row, newNote, userName, onSaved]);

  const handleDeleteNote = useCallback(
    async (index: number) => {
      if (!row) return;
      try {
        const r = await deleteRepDocsNote(row.id, index);
        if (r.success && r.notes) {
          setNotes(r.notes);
          onSaved(row.id, r.notes);
          toast.success("Note deleted");
        }
      } catch {
        toast.error("Failed to delete note");
      }
    },
    [row, onSaved],
  );

  if (!row || !anchorRect) return null;

  const PANEL_W = 340;
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;

  let left = anchorRect.right + 8;
  if (left + PANEL_W > vpW - 8) left = anchorRect.left - PANEL_W - 8;
  if (left < 8) left = 8;

  let top = anchorRect.top;
  const maxH = vpH - top - 16;
  if (top < 8) top = 8;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-50 flex flex-col rounded-xl border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
      style={{ left, top, width: PANEL_W, maxHeight: Math.min(maxH, 480) }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2.5 shrink-0 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <p className="text-xs font-semibold truncate">{row.claimant}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-3">
        {/* Add new note */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Add Note
          </label>
          <textarea
            ref={textareaRef}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleAddNote();
              }
            }}
            placeholder="Enter your note..."
            rows={3}
            className={cn(
              "w-full resize-none rounded-lg border bg-muted/40 px-2.5 py-2 text-xs",
              "placeholder:text-muted-foreground/50",
              "focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring",
              "transition-colors leading-relaxed",
            )}
          />
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-muted-foreground">
              Ctrl+Enter to save
            </p>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={!newNote.trim() || saving}
              onClick={handleAddNote}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              Add Note
            </Button>
          </div>
        </div>

        {/* Notes history */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Notes History{" "}
            <span className="text-muted-foreground/60">
              ({notes.length})
            </span>
          </label>

          {notes.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No notes yet
            </p>
          ) : (
            <div className="space-y-2">
              {notes.map((note, i) => (
                <div
                  key={`${note.date}-${i}`}
                  className="rounded-lg border bg-muted/30 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {note.user || "Unknown"}
                      </span>
                      {note.date && (
                        <span>
                          {new Date(note.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteNote(i)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-xs whitespace-pre-wrap">{note.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-muted/20 px-3 py-2 flex items-center justify-end rounded-b-xl">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
    </div>,
    document.body,
  );
}
