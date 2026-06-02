"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Type, X } from "lucide-react";
import {
  FONT_SIZE_OPTIONS,
  loadFontSize,
  saveFontSize,
  type FontSize,
} from "@/lib/font-size";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── Font size header button ─────────────────────────────────────────────────
// Lives next to the theme toggle in the app header so every authenticated
// user can change the UI scale (the Settings page is role-gated and not
// everyone can reach it). Clicking opens a small modal with the four-option
// radio group. Selection is applied + persisted to localStorage immediately.

export function FontSizeButton() {
  const [open, setOpen] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>("md");
  // Portal target — set after mount so SSR doesn't try to use `document`.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPortalTarget(document.body);
  }, []);

  // Sync from localStorage on mount — value is unknown at SSR.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFontSize(loadFontSize());
  }, []);

  // Close the modal on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleChange = (next: FontSize) => {
    setFontSize(next);
    saveFontSize(next);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        title="Font size"
        aria-label="Open font size settings"
      >
        <Type className="h-4 w-4" />
      </Button>

      {open &&
        portalTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setOpen(false)}
          >
          <div
            className="w-full max-w-sm rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Font Size</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Adjusts the overall UI scale. Saved on this device only.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close font size settings"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {FONT_SIZE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                    fontSize === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <input
                    type="radio"
                    name="font-size"
                    value={opt.value}
                    checked={fontSize === opt.value}
                    onChange={() => handleChange(opt.value)}
                    className="h-4 w-4 cursor-pointer accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {opt.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          </div>,
          portalTarget,
        )}
    </>
  );
}
