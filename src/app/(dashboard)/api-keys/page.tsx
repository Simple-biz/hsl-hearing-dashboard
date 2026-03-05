"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import {
  //   Key,
  Plus,
  Copy,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiKey {
  id: number;
  prefix: string;
  label: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
  expires_at: string | null;
}

const MOCK_KEYS: ApiKey[] = [
  {
    id: 1,
    prefix: "hsl_8f2a",
    label: "n8n Production",
    is_active: true,
    created_at: "2025-01-15",
    last_used_at: "2025-03-03T14:30:00Z",
    request_count: 12453,
    expires_at: null,
  },
  {
    id: 2,
    prefix: "hsl_b4c1",
    label: "n8n Staging",
    is_active: true,
    created_at: "2025-02-01",
    last_used_at: "2025-03-01T10:00:00Z",
    request_count: 892,
    expires_at: "2025-12-31",
  },
  {
    id: 3,
    prefix: "hsl_d9e7",
    label: "Call Coach Extension",
    is_active: false,
    created_at: "2024-11-10",
    last_used_at: "2025-01-15T08:00:00Z",
    request_count: 3201,
    expires_at: null,
  },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState(MOCK_KEYS);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    const mockKey =
      "hsl_" +
      Array.from(
        { length: 48 },
        () => "abcdef0123456789"[Math.floor(Math.random() * 16)],
      ).join("");
    setNewKeyValue(mockKey);
    setShowNewKey(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(newKeyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <AppHeader
        title="API Keys"
        subtitle="Manage external API access for n8n and integrations"
        actions={
          <button
            onClick={handleGenerate}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent 
                     text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            <Plus size={14} /> Generate Key
          </button>
        }
      />

      <div className="p-6 space-y-4">
        {/* New key banner */}
        {showNewKey && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertCircle
                size={18}
                className="text-emerald-600 shrink-0 mt-0.5"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">
                  API Key Generated — Copy it now!
                </p>
                <p className="text-xs text-emerald-600 mt-0.5 mb-3">
                  This key will only be shown once. Store it securely.
                </p>
                <div className="flex items-center gap-2">
                  <code
                    className="flex-1 px-3 py-2 bg-card rounded-lg border border-emerald-200 
                                 text-sm font-mono text-foreground select-all"
                  >
                    {newKeyValue}
                  </code>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      copied
                        ? "bg-emerald-600 text-white"
                        : "bg-card border border-emerald-200 text-emerald-700 hover:bg-emerald-100",
                    )}
                  >
                    {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowNewKey(false)}
                className="text-emerald-400 hover:text-emerald-600"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Keys table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/80">
                  Key
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/80">
                  Label
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/80">
                  Status
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/80">
                  Requests
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/80">
                  Last Used
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/80">
                  Expires
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/80">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr
                  key={key.id}
                  className={cn(
                    "border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors",
                    !key.is_active && "opacity-50",
                  )}
                >
                  <td className="px-5 py-3">
                    <code className="text-sm font-mono text-foreground/70 bg-muted px-2 py-0.5 rounded">
                      {key.prefix}...
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
                        "badge text-[10px]",
                        key.is_active
                          ? "bg-emerald-100 text-emerald-800"
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
                      {key.expires_at || "Never"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button className="p-1.5 rounded hover:bg-red-50 text-muted-foreground/70 hover:text-danger transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Usage note */}
        <div className="bg-muted border border-border rounded-xl px-5 py-4">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground/80">Usage:</strong> Pass the API
            key in the{" "}
            <code className="bg-card px-1.5 py-0.5 rounded text-[11px] font-mono border border-border">
              X-API-Key
            </code>{" "}
            header. Endpoints:{" "}
            <code className="bg-card px-1.5 py-0.5 rounded text-[11px] font-mono border border-border">
              GET /api/v1/hearings
            </code>
            ,{" "}
            <code className="bg-card px-1.5 py-0.5 rounded text-[11px] font-mono border border-border">
              GET /api/v1/representatives
            </code>
          </p>
        </div>
      </div>
    </>
  );
}
