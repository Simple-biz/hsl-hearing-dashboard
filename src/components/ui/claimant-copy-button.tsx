"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const escHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Tiny inline button: copies the given name to the clipboard with brief
 *  ~1.5s "copied" feedback. Used next to claimant names across the app
 *  (dashboard, representative-docs, post-hrg-development, medical-records).
 *  Mirrors the original implementation inside dashboard-client.tsx so any
 *  future tweaks stay in one place.
 *
 *  When `link` is provided, writes BOTH formats via ClipboardItem so that:
 *    • rich-text targets (Outlook, Gmail, Word, Slack) paste a clickable
 *      "<a href={link}>{name}</a>" hyperlink, and
 *    • plain-text targets (Notepad, terminal) paste "name\nlink".
 *  Falls back to plain-text on older browsers that lack ClipboardItem. */
export function ClaimantCopyButton({
  name,
  link,
}: {
  name: string | null;
  link?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        const n = name ?? "";
        const l = link ?? "";
        try {
          if (l && typeof ClipboardItem !== "undefined") {
            const html = `<a href="${escHtml(l)}">${escHtml(n)}</a>`;
            const plain = `${n}\n${l}`;
            await navigator.clipboard.write([
              new ClipboardItem({
                "text/html": new Blob([html], { type: "text/html" }),
                "text/plain": new Blob([plain], { type: "text/plain" }),
              }),
            ]);
          } else {
            await navigator.clipboard.writeText(l ? `${n}\n${l}` : n);
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-blue-600 hover:bg-muted"
      title={link ? "Copy claimant name + MyCase link" : "Copy claimant name"}
    >
      {copied ? (
        <Check className="h-2.5 w-2.5 text-emerald-600" />
      ) : (
        <Copy className="h-2.5 w-2.5" />
      )}
    </button>
  );
}
