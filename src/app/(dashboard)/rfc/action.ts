"use server";

export type {
  RfcUserRole, RfcPermissions, RfcEntry, RfcStats, RfcDocumentType,
  RfcMethodOption, RfcMrTeam, RfcFilters, RfcPaginatedResult,
  RfcPageData, RfcAddEntryInput, RfcActivityLogEntry,
} from "../rfc/types";

import { deriveRfcPermissions } from "../rfc/types";
import type {
  RfcEntry, RfcStats, RfcDocumentType, RfcMethodOption, RfcMrTeam,
  RfcFilters, RfcPaginatedResult, RfcPageData, RfcAddEntryInput, RfcActivityLogEntry,
} from "../rfc/types";

// ─── Stub constants ───────────────────────────────────────────────────────────

const STUB_DOC_TYPES: RfcDocumentType[] = [
  { value: "RFC",                   label: "RFC",                   color: "#2E7D32" },
  { value: "Childhood Eval",        label: "Childhood Eval",        color: "#1976D2" },
  { value: "Teacher Questionnaire", label: "Teacher Questionnaire", color: "#7E57C2" },
  { value: "DME RX",                label: "DME RX",                color: "#8D4B20" },
  { value: "IEP",                   label: "IEP",                   color: "#6D5A1E" },
  { value: "VA Rating",             label: "VA Rating",             color: "#C7A4E0" },
  { value: "Home Healthcare",       label: "Home Healthcare",       color: "#6FA8B6" },
];

const STUB_METHODS: RfcMethodOption[] = [
  { value: "Email",             label: "Email",             color: "#C8E6A0" },
  { value: "Fax",               label: "Fax",               color: "#9ED0F6" },
  { value: "Mail",              label: "Mail",              color: "#D6C2F0" },
  { value: "CS App",            label: "CS App",            color: "#F6B88E" },
  { value: "Text (sent image)", label: "Text (sent image)", color: "#FBE7A1" },
  { value: "Patient Portal",    label: "Patient Portal",    color: "#A7D6D1" },
];

const STUB_TEAMS: RfcMrTeam[] = [
  { id: 1, team_name: "Blue Team",   team_color: "#3b82f6" },
  { id: 2, team_name: "Orange Team", team_color: "#f97316" },
  { id: 3, team_name: "Green Team",  team_color: "#22c55e" },
  { id: 4, team_name: "Yellow Team", team_color: "#eab308" },
  { id: 5, team_name: "Purple Team", team_color: "#a855f7" },
];

// Build a repeatable stub dataset
function buildStubEntries(): RfcEntry[] {
  const clients = [
    "Smith, John", "Doe, Jane", "Johnson, Michael", "Williams, Sarah",
    "Brown, David", "Jones, Emily", "Miller, Robert", "Davis, Linda",
    "Wilson, James", "Taylor, Mary", "Anderson, Thomas", "Martinez, Patricia",
    "Garcia, Charles", "Rodriguez, Barbara", "Lee, Christopher",
  ];
  const docTypes = STUB_DOC_TYPES.map((d) => d.value);
  const methods  = STUB_METHODS.map((m) => m.value);
  const months   = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];

  return Array.from({ length: 75 }, (_, i) => {
    const team = i % 7 === 0 ? null : STUB_TEAMS[i % STUB_TEAMS.length];
    const month = months[i % months.length];
    const day   = String((i % 28) + 1).padStart(2, "0");
    return {
      id:              i + 1,
      entry_date:      `${month}-${day}`,
      mr_team_id:      team?.id ?? null,
      hearing_date:    `${month}-${String(((i + 5) % 28) + 1).padStart(2, "0")}`,
      client_name:     clients[i % clients.length],
      document_type:   docTypes[i % docTypes.length],
      provider_name:   i % 4 === 0 ? null : `Provider ${i + 1}`,
      date_signed:     i % 3 === 0 ? `${month}-${day}` : null,
      mycase_link:     i % 2 === 0 ? "https://app.mycase.com/stub" : null,
      method_received: methods[i % methods.length],
      date_received:   `${month}-${day}`,
      filed_to_oho:    i % 3 === 0,
      approved_by_tl:  i % 5 === 0,
      created_at:      `${month}-${day}T10:00:00Z`,
      updated_at:      `${month}-${day}T10:00:00Z`,
      created_by:      1,
      team_name:       team?.team_name ?? null,
      team_color:      team?.team_color ?? null,
    };
  });
}

function computeStats(entries: RfcEntry[]): RfcStats {
  return {
    total:    entries.length,
    filed:    entries.filter((e) => e.filed_to_oho).length,
    approved: entries.filter((e) => e.approved_by_tl).length,
    pending:  entries.filter((e) => !e.filed_to_oho).length,
  };
}

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function getRfcPageData(): Promise<RfcPageData> {
  // TODO: replace with real DB queries
  const all = buildStubEntries();
  const stats = computeStats(all);

  // Derive available months from hearing_dates
  const monthSet = new Set<string>();
  all.forEach((e) => { if (e.hearing_date) monthSet.add(e.hearing_date.slice(0, 7)); });
  const availableMonths = Array.from(monthSet)
    .sort((a, b) => b.localeCompare(a))
    .map((val) => ({
      val,
      label: new Date(val + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    }));

  return {
    stats,
    documentTypes:   STUB_DOC_TYPES,
    methodOptions:   STUB_METHODS,
    mrTeams:         STUB_TEAMS,
    availableMonths,
    permissions:     deriveRfcPermissions("admin"),
  };
}

export async function getRfcEntries(filters: RfcFilters): Promise<RfcPaginatedResult> {
  // TODO: replace with parameterised DB query — stub filters in-memory
  let entries = buildStubEntries();

  // Search
  if (filters.search?.trim()) {
    const q = filters.search.toLowerCase();
    entries = entries.filter((e) =>
      e.client_name.toLowerCase().includes(q) ||
      e.provider_name?.toLowerCase().includes(q)
    );
  }

  // Status
  if (filters.status === "filed")    entries = entries.filter((e) => e.filed_to_oho);
  if (filters.status === "pending")  entries = entries.filter((e) => !e.filed_to_oho);
  if (filters.status === "approved") entries = entries.filter((e) => e.approved_by_tl);

  // Month (on hearing_date)
  if (filters.month) {
    entries = entries.filter((e) => e.hearing_date?.startsWith(filters.month!));
  }

  // Team
  if (filters.team) {
    if (filters.team === "unassigned") entries = entries.filter((e) => !e.mr_team_id);
    else entries = entries.filter((e) => String(e.mr_team_id) === String(filters.team));
  }

  // Doc type
  if (filters.doc_type) {
    entries = entries.filter((e) => e.document_type === filters.doc_type);
  }

  // Sort by entry_date
  entries.sort((a, b) => {
    const da = a.entry_date ?? "";
    const db = b.entry_date ?? "";
    return filters.sort_order === "asc" ? da.localeCompare(db) : db.localeCompare(da);
  });

  const stats = computeStats(entries);

  // Paginate
  const page    = Math.max(1, filters.page ?? 1);
  const perPage = filters.per_page === "all" ? entries.length : Math.min(500, (filters.per_page as number) ?? 50);
  const paginated = entries.slice((page - 1) * perPage, page * perPage);

  return {
    entries: paginated,
    total:       entries.length,
    page,
    per_page:    perPage,
    total_pages: Math.max(1, Math.ceil(entries.length / (filters.per_page === "all" ? 1 : (filters.per_page as number) ?? 50))),
    stats,
  };
}

export async function addRfcEntry(input: RfcAddEntryInput): Promise<{ success: boolean; id?: number; message?: string }> {
  // TODO: INSERT INTO mr_rfc (...) VALUES (...)
  if (!input.client_name?.trim()) return { success: false, message: "Client name is required" };
  void input;
  return { success: true, id: Math.floor(Math.random() * 10000) + 100 };
}

export async function updateRfcField(
  id: number,
  field: string,
  value: string | number | boolean | null,
): Promise<{ success: boolean; message?: string }> {
  // TODO: UPDATE mr_rfc SET [field] = ? WHERE id = ?
  const allowed = [
    "entry_date", "mr_team_id", "hearing_date", "client_name", "document_type",
    "provider_name", "date_signed", "mycase_link", "method_received",
    "date_received", "filed_to_oho", "approved_by_tl",
  ];
  if (!allowed.includes(field)) return { success: false, message: "Invalid field" };
  void id; void value;
  return { success: true };
}

export async function deleteRfcEntry(id: number): Promise<{ success: boolean; message?: string }> {
  // TODO: DELETE FROM mr_rfc WHERE id = ?
  void id;
  return { success: true };
}

export async function getRfcActivityLog(page = 1): Promise<{
  entries: RfcActivityLogEntry[];
  total: number;
  total_pages: number;
}> {
  // TODO: SELECT FROM activity_log WHERE action IN ('rfc_entry_created','rfc_field_updated','rfc_entry_deleted')
  void page;
  return { entries: [], total: 0, total_pages: 1 };
}
