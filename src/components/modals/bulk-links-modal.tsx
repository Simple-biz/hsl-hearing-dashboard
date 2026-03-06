"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { bulkGenerateTokens } from "@/app/(dashboard)/representatives/action";
import type { BulkResult } from "@/app/(dashboard)/representatives/action";

export function BulkLinksModal({ onClose }: { onClose: () => void }) {
  const [pwLength, setPwLength] = useState(8);
  const [pwType, setPwType] = useState<"alphanumeric" | "numbers">(
    "alphanumeric",
  );
  const [skipExisting, setSkipExisting] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [expires, setExpires] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{
    generated: number;
    skipped: number;
    failed: number;
    emailsSent: number;
    results: BulkResult[];
  } | null>(null);

  const handleGenerate = async () => {
    if (
      !confirm(
        `Generate links for all active reps?${sendEmail ? " Emails will be sent with credentials." : ""}`,
      )
    )
      return;
    setRunning(true);
    setResults(null);
    const res = await bulkGenerateTokens({
      passwordLength: pwLength,
      passwordType: pwType,
      skipExisting,
      sendEmail,
      expiresAt: expires || undefined,
    });
    setResults(res);
    setRunning(false);
  };

  const handleDownload = () => {
    if (!results?.results.length) return;
    let csv = "Name,Email,Password,URL,Status\n";
    results.results.forEach((r) => {
      csv += `"${r.name}","${r.email}","${r.password}","${r.url}","${r.status}"\n`;
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "schedule_links.csv";
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4">
          <h2 className="text-sm font-semibold">
            🔗 Manage All Schedule Links
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
          {!results ? (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">
                  📋 What This Will Do
                </p>
                <ul className="list-disc pl-4 text-xs text-blue-600 dark:text-blue-400 space-y-0.5">
                  <li>Generate a unique schedule link for each active rep</li>
                  <li>Create random passwords for each link</li>
                  <li>Optionally send credentials via email</li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Password Length
                  </label>
                  <Select
                    value={String(pwLength)}
                    onValueChange={(v) => setPwLength(Number(v))}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 chars</SelectItem>
                      <SelectItem value="8">8 chars</SelectItem>
                      <SelectItem value="10">10 chars</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Password Type
                  </label>
                  <Select
                    value={pwType}
                    onValueChange={(v) =>
                      setPwType(v as "alphanumeric" | "numbers")
                    }
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alphanumeric">
                        Letters & Numbers
                      </SelectItem>
                      <SelectItem value="numbers">Numbers Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Expiration Date (Optional)
                </label>
                <Input
                  type="date"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipExisting}
                    onChange={(e) => setSkipExisting(e.target.checked)}
                    className="h-4.5 w-4.5 accent-purple-600"
                  />
                  <div>
                    <p className="text-sm font-medium">
                      Skip reps with existing links
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Don&apos;t regenerate if an active link already exists
                    </p>
                  </div>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    className="h-4.5 w-4.5 accent-purple-600"
                  />
                  <div>
                    <p className="text-sm font-medium">
                      📧 Send email to each rep
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Email credentials (link + password) to each representative
                    </p>
                  </div>
                </label>
              </div>
              {running && (
                <div className="text-center py-6">
                  <Loader2 className="h-10 w-10 animate-spin mx-auto text-purple-600" />
                  <p className="mt-3 text-sm font-medium">Processing...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Generating links and sending emails...
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Results summary */}
              <div
                className={cn(
                  "rounded-lg p-4",
                  results.failed > 0
                    ? "bg-amber-50 dark:bg-amber-950/30"
                    : "bg-emerald-50 dark:bg-emerald-950/30",
                )}
              >
                <p className="text-sm font-semibold">
                  {results.failed > 0 ? "⚠️" : "✅"} Complete
                </p>
                <div className="grid grid-cols-4 gap-3 mt-3">
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums text-green-600">
                      {results.generated}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Generated
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums text-blue-600">
                      {results.emailsSent}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Emailed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums text-amber-600">
                      {results.skipped}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Skipped</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums text-red-600">
                      {results.failed}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Failed</p>
                  </div>
                </div>
              </div>
              {/* Results table */}
              <div className="max-h-75 overflow-auto rounded-lg border">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 bg-card dark:bg-zinc-950">
                    <tr className="border-b">
                      <th className="px-2 py-2 text-left font-bold">Name</th>
                      <th className="px-2 py-2 text-left font-bold">Email</th>
                      <th className="px-2 py-2 text-left font-bold">
                        Password
                      </th>
                      <th className="px-2 py-2 text-left font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.map((r, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-2 py-1.5 font-medium">{r.name}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {r.email}
                        </td>
                        <td className="px-2 py-1.5 font-mono">{r.password}</td>
                        <td className="px-2 py-1.5">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                              r.status.includes("Emailed")
                                ? "bg-blue-100 text-blue-700"
                                : r.status.includes("Generated")
                                  ? "bg-emerald-100 text-emerald-700"
                                  : r.status.includes("Skipped")
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-100 text-red-700",
                            )}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t bg-muted/50 px-5 py-3">
          {!results ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-sm"
                onClick={onClose}
              >
                Close
              </Button>
              <Button
                size="sm"
                className="h-9 text-sm bg-purple-600 hover:bg-purple-700"
                onClick={handleGenerate}
                disabled={running}
              >
                🚀 Generate All
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-sm"
                onClick={handleDownload}
              >
                📥 Download CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-sm"
                onClick={onClose}
              >
                Close
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
