"use client";

import { useState, useCallback } from "react";
import { Search, Filter, X, CalendarDays, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Representative,
  MrTeam,
  ConfigOption,
} from "@/lib/database.types";

export interface HearingFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  month: string;
  year: string;
  repId: string;
  assignmentStatus: string;
  decisionStatus: string;
  mrTeamId: string;
  medicalRecordStatus: string;
}

const EMPTY_FILTERS: HearingFilters = {
  search: "",
  dateFrom: "",
  dateTo: "",
  month: "",
  year: "",
  repId: "",
  assignmentStatus: "",
  decisionStatus: "",
  mrTeamId: "",
  medicalRecordStatus: "",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface FilterBarProps {
  filters: HearingFilters;
  onFilterChange: (filters: HearingFilters) => void;
  representatives: Representative[];
  mrTeams: MrTeam[];
  configOptions: ConfigOption[];
  totalCount: number;
  filteredCount: number;
}

export default function FilterBar({
  filters,
  onFilterChange,
  representatives,
  mrTeams,
  configOptions,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  const update = useCallback(
    (key: keyof HearingFilters, value: string) => {
      onFilterChange({ ...filters, [key]: value });
    },
    [filters, onFilterChange],
  );

  const clearAll = () => onFilterChange(EMPTY_FILTERS);

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");
  const activeCount = Object.values(filters).filter((v) => v !== "").length;

  const decisionOptions = configOptions.filter(
    (o) => o.option_type === "hearing_decision_status",
  );
  const mrStatusOptions = configOptions.filter(
    (o) => o.option_type === "medical_record_status",
  );

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="bg-white border border-navy-200 rounded-xl">
      {/* Primary row: search + toggle + count */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400"
          />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            placeholder="Search claimant, SSN, ALJ..."
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-navy-200
                       bg-navy-50 focus:bg-white focus:border-accent focus:ring-1
                       focus:ring-accent/30 outline-none transition-all placeholder:text-navy-400"
          />
        </div>

        {/* Date shortcuts */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 text-sm text-navy-600">
            <CalendarDays size={14} className="text-navy-400" />
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => update("dateFrom", e.target.value)}
              className="px-2 py-1 text-sm rounded border border-navy-200 bg-navy-50
                         focus:border-accent outline-none"
            />
            <span className="text-navy-400">—</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => update("dateTo", e.target.value)}
              className="px-2 py-1 text-sm rounded border border-navy-200 bg-navy-50
                         focus:border-accent outline-none"
            />
          </div>
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            expanded || hasActiveFilters
              ? "bg-accent/10 text-accent"
              : "bg-navy-100 text-navy-600 hover:bg-navy-200",
          )}
        >
          <Filter size={14} />
          Filters
          {activeCount > 0 && (
            <span
              className="ml-1 w-5 h-5 rounded-full bg-accent text-white text-[10px] 
                           flex items-center justify-center font-bold"
            >
              {activeCount}
            </span>
          )}
          <ChevronDown
            size={14}
            className={cn("transition-transform", expanded && "rotate-180")}
          />
        </button>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm text-navy-500
                       hover:text-danger hover:bg-red-50 transition-colors"
          >
            <X size={14} /> Clear
          </button>
        )}

        {/* Count */}
        <div className="text-sm text-navy-500 ml-auto tabular-nums">
          {filteredCount === totalCount ? (
            <span>{totalCount.toLocaleString()} records</span>
          ) : (
            <span>
              {filteredCount.toLocaleString()} of {totalCount.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="border-t border-navy-100 px-4 py-3 grid grid-cols-5 gap-3">
          <FilterSelect
            label="Month"
            value={filters.month}
            onChange={(v) => update("month", v)}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          />
          <FilterSelect
            label="Year"
            value={filters.year}
            onChange={(v) => update("year", v)}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
          <FilterSelect
            label="Representative"
            value={filters.repId}
            onChange={(v) => update("repId", v)}
            options={representatives
              .filter((r) => r.is_active)
              .map((r) => ({
                value: String(r.id),
                label: r.name,
              }))}
          />
          <FilterSelect
            label="Decision Status"
            value={filters.decisionStatus}
            onChange={(v) => update("decisionStatus", v)}
            options={decisionOptions.map((o) => ({
              value: o.option_value,
              label: o.option_value,
            }))}
          />
          <FilterSelect
            label="MR Team"
            value={filters.mrTeamId}
            onChange={(v) => update("mrTeamId", v)}
            options={mrTeams
              .filter((t) => t.is_active)
              .map((t) => ({
                value: String(t.id),
                label: t.team_name,
              }))}
          />
          <FilterSelect
            label="Assignment Status"
            value={filters.assignmentStatus}
            onChange={(v) => update("assignmentStatus", v)}
            options={[
              { value: "assigned", label: "Assigned" },
              { value: "unassigned", label: "Unassigned" },
              { value: "wd_never_assigned", label: "WD - Never Assigned" },
              { value: "withdrawal", label: "Withdrawal" },
            ]}
          />
          <FilterSelect
            label="Medical Record Status"
            value={filters.medicalRecordStatus}
            onChange={(v) => update("medicalRecordStatus", v)}
            options={mrStatusOptions.map((o) => ({
              value: o.option_value,
              label: o.option_value,
            }))}
          />
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-navy-500 mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full px-2.5 py-1.5 text-sm rounded-lg border border-navy-200",
          "bg-navy-50 focus:bg-white focus:border-accent focus:ring-1",
          "focus:ring-accent/30 outline-none transition-all",
          value ? "text-navy-900" : "text-navy-400",
        )}
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export { EMPTY_FILTERS };
