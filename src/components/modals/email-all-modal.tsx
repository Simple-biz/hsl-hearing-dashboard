"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Mail, Loader2 } from "lucide-react";
import { emailAllReps, getEmailPreviewStats } from "@/app/(dashboard)/actions";

const SEL =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function getMonthOptions() {
  const months: { value: string; label: string }[] = [
    { value: "all", label: "All Assigned Hearings" },
    { value: "future", label: "All Future Hearings" },
  ];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    });
  }
  return months;
}

function formatMonthLabel(value: string) {
  if (value === "all") return "all time";
  if (value === "future") return "future hearings";
  const [year, month] = value.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
}

interface PreviewStats {
  total_hearings: number;
  unique_reps: number;
  with_email: number;
}

export function EmailAllModal({ onClose }: { onClose: () => void }) {
  const [monthFilter, setMonthFilter] = useState("future");
  const [stats, setStats] = useState<PreviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(
    null,
  );
  const [confirmStep, setConfirmStep] = useState(false);

  useEffect(() => {
    setStats(null);
    setLoading(true);
    setResult(null);
    setConfirmStep(false);
    getEmailPreviewStats(monthFilter).then((data) => {
      setStats(data);
      setLoading(false);
    });
  }, [monthFilter]);

  const handleSend = async () => {
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }
    setSending(true);
    try {
      const res = await emailAllReps(monthFilter);
      setResult({ sent: res.count, failed: 0 });
    } catch {
      setResult({ sent: 0, failed: 1 });
    } finally {
      setSending(false);
    }
  };

  const monthLabel = formatMonthLabel(monthFilter);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">
            Email All Assigned Representatives
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Send notification emails to all representatives with assigned
            hearings.
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-semibold">
              Filter by Month
            </label>
            <select
              className={SEL}
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
            >
              {getMonthOptions().map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
              </div>
            ) : result ? (
              <div className="text-xs font-medium text-emerald-600">
                Emails sent: {result.sent} | Failed: {result.failed}
              </div>
            ) : stats ? (
              <>
                <p className="text-xs">
                  <span className="font-semibold">{stats.total_hearings}</span>{" "}
                  hearings with assigned reps for{" "}
                  <span className="font-semibold">{monthLabel}</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border bg-card p-2.5 text-center">
                    <p className="text-lg font-bold tabular-nums">
                      {stats.total_hearings}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Hearings
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-2.5 text-center">
                    <p className="text-lg font-bold tabular-nums">
                      {stats.unique_reps}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Reps</p>
                  </div>
                  <div className="rounded-lg border bg-card p-2.5 text-center">
                    <p className="text-lg font-bold tabular-nums">
                      {stats.with_email}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      With Email
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          {confirmStep && !result && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                Send emails for {monthLabel}? This will notify{" "}
                {stats?.with_email ?? 0} representative
                {(stats?.with_email ?? 0) !== 1 ? "s" : ""}.
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onClose}
          >
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleSend}
              disabled={sending || loading || (stats?.with_email ?? 0) === 0}
            >
              {sending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending...
                </>
              ) : confirmStep ? (
                <>
                  <Mail className="h-3.5 w-3.5" /> Confirm Send
                </>
              ) : (
                <>
                  <Mail className="h-3.5 w-3.5" /> Send {stats?.with_email ?? 0}{" "}
                  Email{(stats?.with_email ?? 0) !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
