"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ExternalLink } from "lucide-react";
import { cn, formatDate, formatTime, truncate } from "@/lib/utils";
import { canEditField, getVisibleColumns, type UserRole } from "@/lib/roles";
import {
  InlineText,
  InlineSelect,
  InlineCheckbox,
  InlineDate,
} from "./InlineEdit";
import StatusBadge, { TeamBadge } from "./StatusBadge";
import type {
  Hearing,
  Representative,
  MrTeam,
  RepDocsAssignee,
  ConfigOption,
} from "@/lib/database.types";

// Column definitions
interface ColumnDef {
  key: string;
  label: string;
  width: string;
  sticky?: boolean;
  sortable?: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "id", label: "#", width: "w-12", sticky: true, sortable: true },
  {
    key: "claimant",
    label: "Claimant",
    width: "w-44",
    sticky: true,
    sortable: true,
  },
  { key: "ssn_last_4", label: "SSN", width: "w-16", sortable: true },
  { key: "hearing_date", label: "Hearing Date", width: "w-28", sortable: true },
  { key: "hearing_time", label: "Time", width: "w-20", sortable: true },
  { key: "converted_time_est", label: "EST", width: "w-20", sortable: true },
  { key: "time_zone", label: "TZ", width: "w-12" },
  { key: "city", label: "City", width: "w-24", sortable: true },
  { key: "state", label: "ST", width: "w-10" },
  { key: "alj", label: "ALJ", width: "w-32", sortable: true },
  {
    key: "assigned_rep_id",
    label: "Representative",
    width: "w-40",
    sortable: true,
  },
  { key: "assignment_status", label: "Assign Status", width: "w-32" },
  { key: "manner_of_appearance", label: "MOA Type", width: "w-28" },
  {
    key: "hearing_decision_status",
    label: "Decision",
    width: "w-32",
    sortable: true,
  },
  { key: "task_assigned", label: "Task", width: "w-14" },
  { key: "rep_docs_complete", label: "Docs", width: "w-14" },
  { key: "rep_docs_assigned_to", label: "Docs Assigned", width: "w-32" },
  { key: "fee_agreement_complete", label: "Fee", width: "w-14" },
  { key: "phi_sheet_complete", label: "PHI", width: "w-14" },
  { key: "five_day_notice", label: "5-Day", width: "w-14" },
  { key: "brief_assigned_to", label: "Brief", width: "w-32" },
  { key: "medical_record_status", label: "MR Status", width: "w-28" },
  { key: "mr_hearing_status", label: "MR Hrg Status", width: "w-28" },
  { key: "mr_team_id", label: "MR Team", width: "w-28" },
  { key: "medical_record_link", label: "MR Link", width: "w-20" },
  { key: "rfc_status", label: "RFC", width: "w-20" },
  { key: "post_hrg_deadline", label: "Post Deadline", width: "w-28" },
  { key: "post_hrg_notes", label: "Post Notes", width: "w-40" },
  { key: "post_hrg_review", label: "Post Rev", width: "w-14" },
  { key: "moa", label: "MOA", width: "w-14" },
  { key: "five_day", label: "5-Day PH", width: "w-14" },
  { key: "credited", label: "Credited", width: "w-14" },
];

interface HearingTableProps {
  hearings: Hearing[];
  userRole: UserRole;
  representatives: Representative[];
  mrTeams: MrTeam[];
  repDocsAssignees: RepDocsAssignee[];
  configOptions: ConfigOption[];
  onUpdate: (hearingId: number, field: string, value: any) => Promise<void>;
}

export default function HearingTable({
  hearings,
  userRole,
  representatives,
  mrTeams,
  repDocsAssignees,
  configOptions,
  onUpdate,
}: HearingTableProps) {
  const [sortField, setSortField] = useState<string>("hearing_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Filter columns based on role
  const visibleColumnKeys = getVisibleColumns(userRole);
  const columns =
    visibleColumnKeys[0] === "ALL"
      ? ALL_COLUMNS
      : ALL_COLUMNS.filter(
          (c) => visibleColumnKeys.includes(c.key) || c.key === "id",
        );

  // Sort
  const sortedHearings = useMemo(() => {
    return [...hearings].sort((a, b) => {
      const aVal = (a as any)[sortField] ?? "";
      const bVal = (b as any)[sortField] ?? "";
      const cmp = String(aVal).localeCompare(String(bVal), undefined, {
        numeric: true,
      });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [hearings, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // Build option lists for select editors
  const repOptions = representatives
    .filter((r) => r.is_active)
    .map((r) => ({ value: String(r.id), label: r.name }));

  const mrTeamOptions = mrTeams
    .filter((t) => t.is_active && t.is_assignable)
    .map((t) => ({
      value: String(t.id),
      label: t.team_name,
      color: t.team_color ?? undefined,
    }));

  const docsAssigneeOptions = repDocsAssignees
    .filter((d) => d.is_active)
    .map((d) => ({ value: d.name, label: d.name }));

  const briefOptions = configOptions
    .filter((o) => o.option_type === "brief_assignment" && o.is_active)
    .map((o) => ({ value: o.option_value, label: o.option_value }));

  const moaOptions = configOptions
    .filter((o) => o.option_type === "manner_of_appearance" && o.is_active)
    .map((o) => ({ value: o.option_value, label: o.option_value }));

  const decisionOptions = configOptions
    .filter((o) => o.option_type === "hearing_decision_status" && o.is_active)
    .map((o) => ({ value: o.option_value, label: o.option_value }));

  const mrStatusOptions = configOptions
    .filter((o) => o.option_type === "medical_record_status" && o.is_active)
    .map((o) => ({ value: o.option_value, label: o.option_value }));

  const mrHrgStatusOptions = configOptions
    .filter((o) => o.option_type === "mr_hearing_status" && o.is_active)
    .map((o) => ({ value: o.option_value, label: o.option_value }));

  // Render a cell based on field type
  function renderCell(hearing: Hearing, col: ColumnDef) {
    const editable = canEditField(userRole, col.key);
    const save = (field: string) => async (value: any) => {
      await onUpdate(hearing.id, field, value);
    };

    switch (col.key) {
      case "id":
        return (
          <span className="text-xs text-navy-400 tabular-nums">
            {hearing.id}
          </span>
        );

      case "claimant":
        return (
          <div className="min-w-0">
            <span className="text-sm font-medium text-navy-900 truncate block">
              {truncate(hearing.claimant, 28)}
            </span>
            {hearing.claim_type && (
              <span className="text-[10px] text-navy-400">
                {hearing.claim_type}
              </span>
            )}
          </div>
        );

      case "ssn_last_4":
        return (
          <span className="text-sm tabular-nums text-navy-600">
            {hearing.ssn_last_4 || "—"}
          </span>
        );

      case "hearing_date":
        return (
          <span className="text-sm tabular-nums">
            {formatDate(hearing.hearing_date)}
          </span>
        );

      case "hearing_time":
        return (
          <span className="text-sm tabular-nums">
            {formatTime(hearing.hearing_time)}
          </span>
        );

      case "converted_time_est":
        return (
          <span className="text-sm tabular-nums text-accent font-medium">
            {formatTime(hearing.converted_time_est)}
          </span>
        );

      case "time_zone":
        return (
          <span className="text-[11px] text-navy-500">{hearing.time_zone}</span>
        );

      case "city":
        return <span className="text-sm">{truncate(hearing.city, 16)}</span>;

      case "state":
        return (
          <span className="text-sm text-navy-600">{hearing.state || "—"}</span>
        );

      case "alj":
        return <span className="text-sm">{truncate(hearing.alj, 22)}</span>;

      case "assigned_rep_id":
        return (
          <InlineSelect
            value={hearing.assigned_rep_id}
            onSave={save("assigned_rep_id")}
            options={repOptions}
            editable={editable}
            placeholder="Unassigned"
          />
        );

      case "assignment_status":
        if (hearing.assignment_status) {
          return (
            <StatusBadge value={hearing.assignment_status} type="assignment" />
          );
        }
        return (
          <InlineSelect
            value={hearing.assignment_status}
            onSave={save("assignment_status")}
            options={[
              { value: "wd_never_assigned", label: "WD - Never Assigned" },
              { value: "withdrawal", label: "Withdrawal" },
            ]}
            editable={editable}
            placeholder="—"
          />
        );

      case "manner_of_appearance":
        return (
          <InlineSelect
            value={hearing.manner_of_appearance}
            onSave={save("manner_of_appearance")}
            options={moaOptions}
            editable={editable}
          />
        );

      case "hearing_decision_status":
        if (!editable && hearing.hearing_decision_status) {
          return (
            <StatusBadge
              value={hearing.hearing_decision_status}
              type="decision"
            />
          );
        }
        return (
          <InlineSelect
            value={hearing.hearing_decision_status}
            onSave={save("hearing_decision_status")}
            options={decisionOptions}
            editable={editable}
          />
        );

      // Boolean checkboxes
      case "task_assigned":
      case "rep_docs_complete":
      case "fee_agreement_complete":
      case "phi_sheet_complete":
      case "five_day_notice":
      case "post_hrg_review":
      case "moa":
      case "five_day":
      case "credited":
        return (
          <InlineCheckbox
            value={(hearing as any)[col.key]}
            onSave={save(col.key)}
            editable={editable}
          />
        );

      case "rep_docs_assigned_to":
        return (
          <InlineSelect
            value={hearing.rep_docs_assigned_to}
            onSave={save("rep_docs_assigned_to")}
            options={docsAssigneeOptions}
            editable={editable}
          />
        );

      case "brief_assigned_to":
        return (
          <InlineSelect
            value={hearing.brief_assigned_to}
            onSave={save("brief_assigned_to")}
            options={briefOptions}
            editable={editable}
          />
        );

      case "medical_record_status":
        if (!editable && hearing.medical_record_status) {
          return (
            <StatusBadge
              value={hearing.medical_record_status}
              type="medical_record"
            />
          );
        }
        return (
          <InlineSelect
            value={hearing.medical_record_status}
            onSave={save("medical_record_status")}
            options={mrStatusOptions}
            editable={editable}
          />
        );

      case "mr_hearing_status":
        return (
          <InlineSelect
            value={hearing.mr_hearing_status}
            onSave={save("mr_hearing_status")}
            options={mrHrgStatusOptions}
            editable={editable}
          />
        );

      case "mr_team_id":
        if (!editable && hearing.mr_team) {
          return (
            <TeamBadge
              name={hearing.mr_team.team_name}
              color={hearing.mr_team.team_color}
            />
          );
        }
        return (
          <InlineSelect
            value={hearing.mr_team_id}
            onSave={save("mr_team_id")}
            options={mrTeamOptions}
            editable={editable}
          />
        );

      case "medical_record_link":
        if (!hearing.medical_record_link)
          return <span className="text-navy-400">—</span>;
        return (
          <a
            href={hearing.medical_record_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            <ExternalLink size={12} /> Link
          </a>
        );

      case "rfc_status":
        return (
          <InlineText
            value={hearing.rfc_status}
            onSave={save("rfc_status")}
            editable={editable}
          />
        );

      case "post_hrg_deadline":
        return (
          <InlineDate
            value={hearing.post_hrg_deadline}
            onSave={save("post_hrg_deadline")}
            editable={editable}
          />
        );

      case "post_hrg_notes":
        return (
          <InlineText
            value={hearing.post_hrg_notes}
            onSave={save("post_hrg_notes")}
            editable={editable}
            placeholder="—"
          />
        );

      default:
        return (
          <span className="text-sm text-navy-500">
            {(hearing as any)[col.key] ?? "—"}
          </span>
        );
    }
  }

  return (
    <div className="bg-white border border-navy-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-navy-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider",
                    "text-navy-500 bg-navy-50/80 whitespace-nowrap select-none",
                    col.sortable &&
                      "cursor-pointer hover:text-navy-700 transition-colors",
                    col.width,
                  )}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable &&
                      sortField === col.key &&
                      (sortDir === "asc" ? (
                        <ChevronUp size={12} className="text-accent" />
                      ) : (
                        <ChevronDown size={12} className="text-accent" />
                      ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedHearings.map((hearing, idx) => (
              <tr
                key={hearing.id}
                className={cn(
                  "border-b border-navy-100 last:border-0",
                  "hover:bg-accent/[0.02] transition-colors",
                  idx % 2 === 0 ? "bg-white" : "bg-navy-50/30",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-3 py-2 align-middle", col.width)}
                  >
                    {renderCell(hearing, col)}
                  </td>
                ))}
              </tr>
            ))}

            {sortedHearings.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-6 py-16 text-center">
                  <p className="text-navy-400 text-sm">No hearings found</p>
                  <p className="text-navy-300 text-xs mt-1">
                    Try adjusting your filters
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
