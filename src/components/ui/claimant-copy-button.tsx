"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** Tiny inline button: copies the given name to the clipboard with brief
 *  ~1.5s "copied" feedback. Used next to claimant names across the app
 *  (dashboard, representative-docs, post-hrg-development, medical-records).
 *  Mirrors the original implementation inside dashboard-client.tsx so any
 *  future tweaks stay in one place. */
export function ClaimantCopyButton({ name }: { name: string | null }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(name ?? "");
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-blue-600 hover:bg-muted"
      title="Copy claimant name"
    >
      {copied ? (
        <Check className="h-2.5 w-2.5 text-emerald-600" />
      ) : (
        <Copy className="h-2.5 w-2.5" />
      )}
    </button>
  );
}
