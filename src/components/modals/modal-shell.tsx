"use client";

import { useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { cn } from "@/lib/utils";

interface ModalShellProps {
  /** Modal title shown in the header */
  title: string;
  /** Optional Lucide icon rendered before the title */
  icon?: React.ElementType;
  /** Called when backdrop is clicked or Escape is pressed */
  onClose: () => void;
  /** Tailwind max-width class — defaults to "max-w-md" */
  maxWidth?: string;
  /** Buttons / controls rendered to the left of the close button in the header */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared modal wrapper matching the project's established pattern from
 * settings-client.tsx and admin-client.tsx:
 *   - bg-black/60 backdrop-blur-sm backdrop
 *   - animate-in fade-in-0 zoom-in-95 entry animation
 *   - Neutral card header + Separator
 *   - SVG close button (consistent with the rest of the codebase)
 */
export function ModalShell({
  title,
  icon: Icon,
  onClose,
  maxWidth = "max-w-md",
  actions,
  children,
}: ModalShellProps) {
  useBodyScrollLock(true);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className={cn(
          "relative w-full rounded-xl border bg-card shadow-2xl",
          "animate-in fade-in-0 zoom-in-95",
          "max-h-[88vh] flex flex-col overflow-hidden",
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && (
              <Icon size={17} className="text-muted-foreground shrink-0" />
            )}
            <h2 className="text-base font-semibold truncate">{title}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            {/* SVG close button — matches settings & admin pattern exactly */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path
                  d="M1 1l12 12M13 1L1 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <Separator />

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
