"use client";

import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X as XIcon,
  Upload,
  UserPlus,
  Loader2,
  Copy,
  Download,
  Trash2,
  Eye,
  EyeOff,
  Dice5,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { bulkCreateUsers } from "@/app/(dashboard)/admin/actions";
import type { AdminUser } from "@/app/(dashboard)/admin/actions";
import type { UserRole } from "@/lib/roles";

const ALL_ROLES = [
  { value: "admin", label: "Administrator", group: "Administration" },
  { value: "manager", label: "Manager", group: "Administration" },
  { value: "hearings_admin", label: "Hearings Admin", group: "Hearings" },
  { value: "hearings_agent", label: "Hearings Agent", group: "Hearings" },
  {
    value: "hearings_status_moa",
    label: "Hearings Status/MOA",
    group: "Hearings",
  },
  {
    value: "hearings_docs_fee",
    label: "Hearings Docs & Fee",
    group: "Hearings",
  },
  { value: "hearings_docs", label: "Hearings Docs", group: "Hearings" },
  { value: "hearings_mc", label: "Hearings MC", group: "Hearings" },
  { value: "hearings_brief", label: "Hearings Brief", group: "Hearings" },
  { value: "mr_admin", label: "MR Admin", group: "Medical Records" },
  { value: "mr_lead", label: "MR Lead", group: "Medical Records" },
  { value: "mr_agent", label: "MR Agent", group: "Medical Records" },
  { value: "pre_hearing_staff", label: "Pre-Hearing Staff", group: "Staff" },
  { value: "brief_agent", label: "Brief Agent", group: "Staff" },
  { value: "post_hearing_admin", label: "Post Hearing Admin", group: "Staff" },
  { value: "post_hearing_staff", label: "Post Hearing Staff", group: "Staff" },
  { value: "staff", label: "Staff", group: "Staff" },
  { value: "chronicle_editor", label: "Chronicle Editor", group: "Staff" },
  { value: "link_editor", label: "Link Editor", group: "Staff" },
  { value: "rep", label: "Representative", group: "Representatives" },
];

const VALID_ROLES = new Set(ALL_ROLES.map((r) => r.value));

interface BulkUser {
  full_name: string;
  email: string;
  role: string;
  password: string;
  rep_type: string;
  valid: boolean;
  error?: string;
}

function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
  return Array.from(
    { length: 12 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

export function BulkCreateModal({
  onClose,
  onCreated,
  existingEmails,
}: {
  onClose: () => void;
  onCreated: (users: AdminUser[]) => void;
  existingEmails: Set<string>;
}) {
  const [step, setStep] = useState<"input" | "review" | "result">("input");
  const [rows, setRows] = useState<BulkUser[]>([]);
  const [csvText, setCsvText] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{
    created: {
      full_name: string;
      email: string;
      password: string;
      role: string;
    }[];
    skipped: { email: string; reason: string }[];
  } | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(true);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [sendVideo, setSendVideo] = useState(false);

  // Parse CSV text into rows
  const handleParse = useCallback(() => {
    const lines = csvText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    // Detect if first line is header
    const firstLower = lines[0].toLowerCase();
    const hasHeader =
      firstLower.includes("email") ||
      firstLower.includes("name") ||
      firstLower.includes("role");
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const parsed: BulkUser[] = dataLines.map((line) => {
      const parts = line
        .split(",")
        .map((p) => p.trim().replace(/^["']|["']$/g, ""));
      const [
        full_name = "",
        email = "",
        role = "staff",
        password = "",
        rep_type = "",
      ] = parts;

      const pw = password || generatePassword();
      const errors: string[] = [];
      const isRepRole = role === "rep";

      if (!full_name) errors.push("Missing name");
      if (!email || !email.includes("@")) errors.push("Invalid email");
      if (existingEmails.has(email.toLowerCase())) errors.push("Email exists");
      if (role && !VALID_ROLES.has(role)) errors.push(`Invalid role "${role}"`);
      if (
        isRepRole &&
        rep_type &&
        !["in-house", "internal_advocates", "external_advocates"].includes(
          rep_type,
        )
      ) {
        errors.push(`Invalid rep_type "${rep_type}"`);
      }

      return {
        full_name,
        email,
        role: VALID_ROLES.has(role) ? role : "staff",
        password: pw,
        rep_type: isRepRole ? rep_type || "in-house" : "",
        valid: errors.length === 0,
        error: errors.length > 0 ? errors.join("; ") : undefined,
      };
    });

    setRows(parsed);
    setStep("review");
  }, [csvText, existingEmails]);

  // Add a manual row
  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      {
        full_name: "",
        email: "",
        role: "staff",
        password: generatePassword(),
        rep_type: "",
        valid: false,
        error: "Fill in fields",
      },
    ]);
    if (step === "input") setStep("review");
  };

  // Update a row field
  const updateRow = (index: number, field: keyof BulkUser, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };

      // Re-validate
      const errors: string[] = [];
      if (!row.full_name) errors.push("Missing name");
      if (!row.email || !row.email.includes("@")) errors.push("Invalid email");
      if (existingEmails.has(row.email.toLowerCase()))
        errors.push("Email exists");
      // Check duplicate emails within batch
      const dupeInBatch = next.some(
        (r, i) =>
          i !== index &&
          r.email.toLowerCase() === row.email.toLowerCase() &&
          row.email,
      );
      if (dupeInBatch) errors.push("Duplicate in batch");
      if (!VALID_ROLES.has(row.role)) errors.push(`Invalid role`);
      // Auto-set rep_type when role changes to/from rep
      if (row.role === "rep" && !row.rep_type) row.rep_type = "in-house";
      if (row.role !== "rep") row.rep_type = "";

      row.valid = errors.length === 0;
      row.error = errors.length > 0 ? errors.join("; ") : undefined;
      next[index] = row;
      return next;
    });
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const regenerateAllPasswords = () => {
    setRows((prev) =>
      prev.map((r) => ({ ...r, password: generatePassword() })),
    );
  };

  const validRows = rows.filter((r) => r.valid);

  // Submit
  const handleCreate = async () => {
    if (validRows.length === 0) return;
    setCreating(true);
    try {
      const res = await bulkCreateUsers(
        validRows.map((r) => ({
          full_name: r.full_name,
          email: r.email,
          role: r.role as UserRole,
          password: r.password,
          rep_type: r.rep_type || undefined,
          force_password_change: forcePasswordChange,
        })),
      );
      setResult({
        created: res.created.map((c, i) => ({
          ...c,
          password: validRows[i]?.password || "",
          role: validRows[i]?.role || "staff",
        })),
        skipped: res.skipped,
      });

      // Send emails for created users
      if (res.newUsers && (sendWelcome || sendVideo)) {
        const { sendWelcomeEmail, sendVideoTutorialEmail } =
          await import("@/app/(dashboard)/admin/actions");
        for (let i = 0; i < res.newUsers.length; i++) {
          const user = res.newUsers[i];
          const pw = validRows[i]?.password || "";
          try {
            if (sendVideo) {
              await sendVideoTutorialEmail(user.id, pw);
            } else if (sendWelcome) {
              await sendWelcomeEmail(user.id, pw);
            }
          } catch {
            // Email send failed — user was still created
          }
        }
      }

      if (res.newUsers) onCreated(res.newUsers);
      setStep("result");
    } catch {
      // handle error
    }
    setCreating(false);
  };

  // Download credentials CSV
  const handleDownloadCredentials = () => {
    if (!result) return;
    const csv = [
      "Full Name,Email,Password,Role",
      ...result.created.map(
        (u) => `"${u.full_name}","${u.email}","${u.password}","${u.role}"`,
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "new_user_credentials.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold">👥 Bulk Create Users</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {step === "input" && "Paste CSV or add users manually"}
              {step === "review" &&
                `${validRows.length} valid of ${rows.length} rows`}
              {step === "result" &&
                `${result?.created.length || 0} users created`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Step: Input */}
          {step === "input" && (
            <>
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    CSV Format
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    full_name, email, role, password (optional), rep_type (for
                    reps)
                  </p>
                </div>
                <textarea
                  className="w-full h-40 rounded-md border bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={`John Doe, john@hogansmith.com, hearings_status_moa
Jane Smith, jane@hogansmith.com, mr_agent
Test User, testuser@hogansmith.com, staff, customP@ss123
Test Rep, testrep@hogansmith.com, rep, , in-house`}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleParse}
                    disabled={!csvText.trim()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Parse CSV
                  </Button>
                  <span className="text-xs text-muted-foreground">or</span>
                  <Button size="sm" variant="outline" onClick={handleAddRow}>
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                    Add Row Manually
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 border p-3 text-xs text-muted-foreground space-y-2">
                <p className="font-medium">Available roles:</p>
                <div className="grid gap-0.5 leading-relaxed">
                  <p>
                    <span className="font-semibold text-foreground">admin</span>{" "}
                    — Full access to all features and settings
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      manager
                    </span>{" "}
                    — Full access, similar to admin
                  </p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    Hearings Team
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      hearings_admin
                    </span>{" "}
                    — Full hearings management (assign reps, edit all hearing
                    fields, reports)
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      hearings_agent
                    </span>{" "}
                    — View-only access to hearing dashboard &amp; schedule
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      hearings_status_moa
                    </span>{" "}
                    — Can update hearing status &amp; MOA only, rest is
                    view-only
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      hearings_docs_fee
                    </span>{" "}
                    — Can update docs assigned, rep docs &amp; fee agreement
                    only
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      hearings_docs
                    </span>{" "}
                    — Can update docs assigned, rep docs &amp; fee agreement
                    only
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      hearings_mc
                    </span>{" "}
                    — Can add/update claimant link only, rest is view-only
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      hearings_brief
                    </span>{" "}
                    — Can add/update brief only, rest is view-only
                  </p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    Medical Records
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      mr_admin
                    </span>{" "}
                    — Full MR management: edit MR team, task, MR status,
                    worksheet link, 5-day notice, decision status. View MOA,
                    credited, claimant link. Access: Dashboard, MR Pivot,
                    Patient Portal, RFC, Settings
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      mr_lead
                    </span>{" "}
                    — MR lead: edit MR status, worksheet link, 5-day notice.
                    View MR team, task, MOA, decision status, credited, claimant
                    link. Access: Dashboard, MR Pivot, Patient Portal, RFC,
                    Settings
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      mr_agent
                    </span>{" "}
                    — MR agent: edit MR status, worksheet link, 5-day notice.
                    View MR team, task, MOA, decision status, credited, claimant
                    link. Access: Dashboard, MR Pivot, Patient Portal, RFC
                  </p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    Staff
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      pre_hearing_staff
                    </span>{" "}
                    — Rep docs &amp; fee agreement fields
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      brief_agent
                    </span>{" "}
                    — Brief assignment, rep docs &amp; fee agreement
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      post_hearing_admin
                    </span>{" "}
                    — Post-hearing review, decision status &amp; notes
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      post_hearing_staff
                    </span>{" "}
                    — Post-hearing review &amp; notes
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">staff</span>{" "}
                    — View-only dashboard access
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      chronicle_editor
                    </span>{" "}
                    — Can add/update Chronicle link only, rest is view-only
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      link_editor
                    </span>{" "}
                    — Can add/update both Chronicle link and Claimant link,
                    rest is view-only
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">rep</span> —
                    Representative (limited view, own hearings only)
                  </p>
                </div>
                <p className="mt-2 font-medium">Notes:</p>
                <p>
                  If password is omitted, a random 12-character password is
                  generated.
                </p>
                <p>
                  If role is omitted or invalid, defaults to &quot;staff&quot;.
                </p>
                <p>
                  For rep role, add rep_type as 5th column: in-house,
                  internal_advocates, or external_advocates. Defaults to
                  &quot;in-house&quot;.
                </p>
              </div>
            </>
          )}

          {/* Step: Review */}
          {step === "review" && (
            <>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStep("input")}
                >
                  ← Back to CSV
                </Button>
                <Button size="sm" variant="outline" onClick={handleAddRow}>
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                  Add Row
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={regenerateAllPasswords}
                >
                  <Dice5 className="h-3.5 w-3.5 mr-1.5" />
                  Regenerate All Passwords
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowPasswords(!showPasswords)}
                >
                  {showPasswords ? (
                    <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {showPasswords ? "Hide" : "Show"} Passwords
                </Button>
              </div>

              {/* Options */}
              <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Options (applies to all users)
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={forcePasswordChange}
                      onChange={(e) => setForcePasswordChange(e.target.checked)}
                      className="accent-primary"
                    />
                    Require password change on first login
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="emailOption"
                      checked={sendWelcome && !sendVideo}
                      onChange={() => {
                        setSendWelcome(true);
                        setSendVideo(false);
                      }}
                      className="accent-primary"
                    />
                    <span>Send welcome email with credentials</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="emailOption"
                      checked={sendVideo}
                      onChange={() => {
                        setSendVideo(true);
                        setSendWelcome(false);
                      }}
                      className="accent-primary"
                    />
                    <span>
                      Send scheduling video tutorial
                      <span className="text-muted-foreground ml-1">
                        (includes credentials + video)
                      </span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="emailOption"
                      checked={!sendWelcome && !sendVideo}
                      onChange={() => {
                        setSendWelcome(false);
                        setSendVideo(false);
                      }}
                      className="accent-primary"
                    />
                    <span className="text-muted-foreground">No email</span>
                  </label>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-auto max-h-100">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold w-8">
                          #
                        </th>
                        <th className="px-2 py-1.5 text-left font-semibold">
                          Full Name
                        </th>
                        <th className="px-2 py-1.5 text-left font-semibold">
                          Email
                        </th>
                        <th className="px-2 py-1.5 text-left font-semibold">
                          Role
                        </th>
                        <th className="px-2 py-1.5 text-left font-semibold">
                          Rep Type
                        </th>
                        <th className="px-2 py-1.5 text-left font-semibold">
                          Password
                        </th>
                        <th className="px-2 py-1.5 text-left font-semibold w-16">
                          Status
                        </th>
                        <th className="px-2 py-1.5 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((row, i) => (
                        <tr
                          key={i}
                          className={cn(
                            "hover:bg-muted/30",
                            !row.valid && "bg-red-50/50 dark:bg-red-950/10",
                          )}
                        >
                          <td className="px-2 py-1 text-muted-foreground">
                            {i + 1}
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              value={row.full_name}
                              onChange={(e) =>
                                updateRow(i, "full_name", e.target.value)
                              }
                              className="h-7 text-xs"
                              placeholder="Full Name"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              value={row.email}
                              onChange={(e) =>
                                updateRow(i, "email", e.target.value)
                              }
                              className="h-7 text-xs"
                              placeholder="email@hogansmith.com"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <select
                              value={row.role}
                              onChange={(e) =>
                                updateRow(i, "role", e.target.value)
                              }
                              className="h-7 w-full rounded-md border bg-background px-1.5 text-xs"
                            >
                              {ALL_ROLES.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            {row.role === "rep" ? (
                              <select
                                value={row.rep_type || "in-house"}
                                onChange={(e) =>
                                  updateRow(i, "rep_type", e.target.value)
                                }
                                className="h-7 w-full rounded-md border bg-background px-1.5 text-xs"
                              >
                                <option value="in-house">In-House</option>
                                <option value="internal_advocates">
                                  Internal Advocates
                                </option>
                                <option value="external_advocates">
                                  External Advocates
                                </option>
                              </select>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            <div className="flex items-center gap-1">
                              <Input
                                type={showPasswords ? "text" : "password"}
                                value={row.password}
                                onChange={(e) =>
                                  updateRow(i, "password", e.target.value)
                                }
                                className="h-7 text-xs font-mono flex-1"
                              />
                              <button
                                onClick={() =>
                                  updateRow(i, "password", generatePassword())
                                }
                                className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground"
                                title="Regenerate"
                              >
                                <Dice5 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-1">
                            {row.valid ? (
                              <span className="text-emerald-600 text-[10px]">
                                ✓ Ready
                              </span>
                            ) : (
                              <span
                                className="text-red-500 text-[10px]"
                                title={row.error}
                              >
                                ✗ {row.error}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            <button
                              onClick={() => removeRow(i)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Step: Result */}
          {step === "result" && result && (
            <>
              {result.created.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 border-b">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                        {result.created.length} Users Created
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1"
                      onClick={handleDownloadCredentials}
                    >
                      <Download className="h-3 w-3" />
                      Download Credentials CSV
                    </Button>
                  </div>
                  <div className="overflow-auto max-h-75">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold">
                            Name
                          </th>
                          <th className="px-2 py-1.5 text-left font-semibold">
                            Email
                          </th>
                          <th className="px-2 py-1.5 text-left font-semibold">
                            Role
                          </th>
                          <th className="px-2 py-1.5 text-left font-semibold">
                            Password
                          </th>
                          <th className="px-2 py-1.5 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {result.created.map((u, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-2 py-1.5 font-medium">
                              {u.full_name}
                            </td>
                            <td className="px-2 py-1.5">{u.email}</td>
                            <td className="px-2 py-1.5">{u.role}</td>
                            <td className="px-2 py-1.5 font-mono">
                              {u.password}
                            </td>
                            <td className="px-2 py-1.5">
                              <button
                                onClick={() =>
                                  navigator.clipboard.writeText(u.password)
                                }
                                className="p-1 rounded hover:bg-muted text-muted-foreground"
                                title="Copy password"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {result.skipped.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border-b">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                      {result.skipped.length} Skipped
                    </p>
                  </div>
                  <div className="overflow-auto max-h-37.5">
                    <table className="w-full text-xs">
                      <tbody className="divide-y">
                        {result.skipped.map((s, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5">{s.email}</td>
                            <td className="px-3 py-1.5 text-amber-600">
                              {s.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            {step === "result" ? "Done" : "Cancel"}
          </Button>
          {step === "review" && (
            <Button
              size="sm"
              disabled={validRows.length === 0 || creating}
              onClick={handleCreate}
              className="gap-1.5"
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Create {validRows.length} Users
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
