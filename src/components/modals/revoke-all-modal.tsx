"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { revokeAllTokens } from "@/app/(dashboard)/representatives/action";

export function RevokeAllModal({ onClose }: { onClose: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);

  const handleRevoke = async () => {
    if (confirmText.toUpperCase() !== "REVOKE ALL") return;
    setRunning(true);
    const res = await revokeAllTokens();
    setRunning(false);
    onClose();
    alert(`Revoked ${res.revokedCount} links`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4">
          <h2 className="text-sm font-semibold text-red-600">
            🚫 Revoke All Links
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              ⚠️ This cannot be undone!
            </p>
            <ul className="mt-1 list-disc pl-4 text-xs text-red-600 dark:text-red-400 space-y-0.5">
              <li>All schedule links will be deactivated</li>
              <li>All reps will lose access to their schedule pages</li>
              <li>New links will need to be generated</li>
            </ul>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Type <strong>REVOKE ALL</strong> to confirm:
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="REVOKE ALL"
              className="h-10 text-sm uppercase"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t bg-muted/50 px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-9 text-sm"
            onClick={handleRevoke}
            disabled={running || confirmText.toUpperCase() !== "REVOKE ALL"}
          >
            {running ? "Revoking..." : "🚫 Revoke All"}
          </Button>
        </div>
      </div>
    </div>
  );
}
