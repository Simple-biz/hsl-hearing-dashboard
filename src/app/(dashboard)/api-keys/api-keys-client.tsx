"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import {
  Plus,
  Copy,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createApiKey, revokeApiKey, type ApiKeyAdminRow } from "./actions";

export function ApiKeysClient({
  initialKeys,
}: {
  initialKeys: ApiKeyAdminRow[];
}) {
  const [keys, setKeys] = useState<ApiKeyAdminRow[]>(initialKeys);
  // Plaintext of the most recently generated key — shown exactly once in the
  // green banner, then cleared from memory when the banner is dismissed.
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [genLabel, setGenLabel] = useState("");
  const [genExpires, setGenExpires] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    if (!genLabel.trim()) {
      setError("Label is required.");
      return;
    }
    setSubmitting(true);
    try {
      const { fullKey, row } = await createApiKey(
        genLabel,
        genExpires || null,
      );
      setKeys((prev) => [row, ...prev]);
      setNewKeyValue(fullKey);
      setShowGenerateForm(false);
      setGenLabel("");
      setGenExpires("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate key.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!newKeyValue) return;
    navigator.clipboard.writeText(newKeyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async (id: number, label: string) => {
    if (!confirm(`Revoke API key "${label}"? Sister projects using this key will start receiving 401 errors.`)) {
      return;
    }
    try {
      await revokeApiKey(id);
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, is_active: false } : k)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Revoke failed.");
    }
  };

  return (
    <>
      <AppHeader
        title="API Keys"
        subtitle="Manage external API access for sister projects and integrations"
        actions={
          <button
            onClick={() => {
              setShowGenerateForm((v) => !v);
              setError(null);
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            <Plus size={14} />{" "}
            {showGenerateForm ? "Cancel" : "Generate Key"}
          </button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Inline generate form */}
        {showGenerateForm && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <p className="text-sm font-semibold text-foreground">
              Generate a new API key
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2">
              <input
                type="text"
                value={genLabel}
                onChange={(e) => setGenLabel(e.target.value)}
                placeholder="Label (e.g. n8n Production, Sister App)"
                className="px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                autoFocus
              />
              <input
                type="date"
                value={genExpires}
                onChange={(e) => setGenExpires(e.target.value)}
                title="Optional expiry (leave blank for never)"
                className="px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={handleGenerate}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
              >
                {submitting ? "Generating…" : "Generate"}
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              The plaintext key will be shown once — copy and store it
              immediately. You can revoke it later but cannot retrieve it.
            </p>
          </div>
        )}

        {/* New key banner — shown once, after generation */}
        {newKeyValue && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertCircle
                size={18}
                className="text-emerald-600 shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  API Key Generated — Copy it now!
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-0.5 mb-3">
                  This key will only be shown once. Store it securely.
                </p>
                <div className="flex items-center gap-2">
                  <code
                    className="flex-1 px-3 py-2 bg-card rounded-lg border border-emerald-200 dark:border-emerald-800
                                 text-sm font-mono text-foreground select-all break-all"
                  >
                    {newKeyValue}
                  </code>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0",
                      copied
                        ? "bg-emerald-600 text-white"
                        : "bg-card border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
                    )}
                  >
                    {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setNewKeyValue(null)}
                className="text-emerald-400 hover:text-emerald-600 shrink-0"
                title="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Keys table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {[
                  "Key",
                  "Label",
                  "Status",
                  "Requests",
                  "Last Used",
                  "Expires",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/80"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-sm text-muted-foreground"
                  >
                    No API keys yet. Click <strong>Generate Key</strong> to
                    mint one.
                  </td>
                </tr>
              ) : (
                keys.map((key) => (
                  <tr
                    key={key.id}
                    className={cn(
                      "border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors",
                      !key.is_active && "opacity-50",
                    )}
                  >
                    <td className="px-5 py-3">
                      <code className="text-sm font-mono text-foreground/70 bg-muted px-2 py-0.5 rounded">
                        {key.prefix}…
                      </code>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium text-foreground">
                        {key.label}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold",
                          key.is_active
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {key.is_active ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-foreground/70 tabular-nums">
                        {key.request_count.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-muted-foreground">
                        {key.last_used_at
                          ? new Date(key.last_used_at).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric" },
                            )
                          : "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-muted-foreground">
                        {key.expires_at
                          ? new Date(key.expires_at).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric", year: "numeric" },
                            )
                          : "Never"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {key.is_active && (
                        <button
                          onClick={() => handleRevoke(key.id, key.label)}
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground/70 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Revoke key"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Usage note */}
        <div className="bg-muted border border-border rounded-xl px-5 py-4">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground/80">Usage:</strong> pass the
            API key in the{" "}
            <code className="bg-card px-1.5 py-0.5 rounded text-[11px] font-mono border border-border">
              X-API-Key
            </code>{" "}
            header (or{" "}
            <code className="bg-card px-1.5 py-0.5 rounded text-[11px] font-mono border border-border">
              Authorization: Bearer &lt;key&gt;
            </code>
            ). Endpoints:{" "}
            <code className="bg-card px-1.5 py-0.5 rounded text-[11px] font-mono border border-border">
              GET /api/v1/hearings
            </code>
            ,{" "}
            <code className="bg-card px-1.5 py-0.5 rounded text-[11px] font-mono border border-border">
              GET /api/v1/hearings/&#123;id&#125;
            </code>
            ,{" "}
            <code className="bg-card px-1.5 py-0.5 rounded text-[11px] font-mono border border-border">
              GET /api/v1/representatives
            </code>
            . Full interactive reference at{" "}
            <a
              href="/dev-docs"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              /dev-docs
            </a>
            .
          </p>
        </div>
      </div>
    </>
  );
}
