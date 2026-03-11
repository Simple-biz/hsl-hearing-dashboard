"use server";

export type {
  PortalUserRole, PortalPermissions, MrSpecialist, PortalNote, PortalEntry,
  PortalStats, PortalFilters, PortalPaginatedResult, PortalPageData,
  PortalAddEntryInput, PortalActivityEntry,
} from "../patient-portal/types";

import { derivePortalPermissions } from "../patient-portal/types";
import type {
  MrSpecialist, PortalEntry, PortalNote, PortalStats, PortalFilters,
  PortalPaginatedResult, PortalPageData, PortalAddEntryInput, PortalActivityEntry,
} from "../patient-portal/types";

// ─── Stub constants ───────────────────────────────────────────────────────────

const STUB_SPECIALISTS: MrSpecialist[] = [
  { id:  1, name: "Vicky Mortos",        bg_color: "#fed7aa", display_order:  1, is_active: true },
  { id:  2, name: "Noah Villanueva",     bg_color: "#fef9c3", display_order:  2, is_active: true },
  { id:  3, name: "Carol Ebardo",        bg_color: "#fed7aa", display_order:  3, is_active: true },
  { id:  4, name: "Trina Malazarte",     bg_color: "#fed7aa", display_order:  4, is_active: true },
  { id:  5, name: "Maya Tampos",         bg_color: "#86efac", display_order:  5, is_active: true },
  { id:  6, name: "Nina Cruz",           bg_color: "#86efac", display_order:  6, is_active: true },
  { id:  7, name: "Van Petigayon",       bg_color: null,      display_order:  7, is_active: true },
  { id:  8, name: "Jerome Aguirre",      bg_color: "#86efac", display_order:  8, is_active: true },
  { id:  9, name: "Vera del Prado",      bg_color: null,      display_order:  9, is_active: true },
  { id: 10, name: "Gail Quillosa",       bg_color: "#86efac", display_order: 10, is_active: true },
  { id: 11, name: "Fred Sevilla",        bg_color: null,      display_order: 11, is_active: true },
  { id: 12, name: "Kourtney Benito",     bg_color: "#e9d5ff", display_order: 12, is_active: true },
  { id: 13, name: "Emerald Faeldan",     bg_color: "#fef9c3", display_order: 13, is_active: true },
  { id: 14, name: "Glenda Villanueva",   bg_color: null,      display_order: 14, is_active: true },
  { id: 15, name: "Claire Cortes",       bg_color: "#fed7aa", display_order: 15, is_active: true },
  { id: 16, name: "Milton Baillo",       bg_color: "#fef9c3", display_order: 16, is_active: true },
  { id: 17, name: "Winter Generalao",    bg_color: "#fef9c3", display_order: 17, is_active: true },
  { id: 18, name: "Tracy Caldoza",       bg_color: null,      display_order: 18, is_active: true },
  { id: 19, name: "Naomi Gaspar",        bg_color: "#86efac", display_order: 19, is_active: true },
  { id: 20, name: "Scarlet Estologa",    bg_color: "#86efac", display_order: 20, is_active: true },
  { id: 21, name: "Jasper Soljon",       bg_color: "#fef9c3", display_order: 21, is_active: true },
  { id: 22, name: "Jerry Adove",         bg_color: "#86efac", display_order: 22, is_active: true },
  { id: 23, name: "Ashton Asackil",      bg_color: "#fef9c3", display_order: 23, is_active: true },
  { id: 24, name: "Ralph Ramirez",       bg_color: "#fed7aa", display_order: 24, is_active: true },
  { id: 25, name: "Dexter Tagulinao",    bg_color: "#86efac", display_order: 25, is_active: true },
  { id: 26, name: "Jettson Vasquez",     bg_color: "#86efac", display_order: 26, is_active: true },
  { id: 27, name: "Charles Dela Cruz",   bg_color: null,      display_order: 27, is_active: true },
  { id: 28, name: "Carlyle Cortes",      bg_color: "#86efac", display_order: 28, is_active: true },
];

const STUB_CLIENTS = [
  "Smith, John","Doe, Jane","Johnson, Michael","Williams, Sarah","Brown, David",
  "Jones, Emily","Miller, Robert","Davis, Linda","Wilson, James","Taylor, Mary",
  "Anderson, Thomas","Martinez, Patricia","Garcia, Charles","Rodriguez, Barbara",
  "Lee, Christopher","Walker, Nancy","Hall, Daniel","Allen, Karen","Young, Paul",
  "Hernandez, Sandra",
];

const STUB_PROVIDERS = [
  "Quest Diagnostics","LabCorp","Mayo Clinic","CVS Health","Walgreens Health",
  "Kaiser Permanente","UPMC","Anthem","Aetna","Humana",
  "United Healthcare","Blue Cross","Cigna","WellCare","Centene",
];

const MONTHS = ["2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"];

function buildStubEntries(): PortalEntry[] {
  return Array.from({ length: 90 }, (_, i) => {
    const month = MONTHS[i % MONTHS.length];
    const day   = String((i % 28) + 1).padStart(2, "0");
    const spec  = i % 8 === 0 ? null : STUB_SPECIALISTS[i % STUB_SPECIALISTS.length];
    const hasPortal = i % 3 !== 0;
    const gotMr = i % 4 === 0;
    const approved = i % 5 === 0;
    return {
      id: i + 1,
      entry_date: `${month}-${day}`,
      hearing_date: `${month}-${String(((i + 7) % 28) + 1).padStart(2, "0")}`,
      client_name: STUB_CLIENTS[i % STUB_CLIENTS.length],
      provider: STUB_PROVIDERS[i % STUB_PROVIDERS.length],
      mycase_link: i % 2 === 0 ? "https://app.mycase.com/stub" : null,
      portal_link: hasPortal ? "https://portal.example.com/stub" : null,
      portal_username: hasPortal ? `user${i + 1}@portal.com` : null,
      portal_password: hasPortal ? `Pass${i + 1}!` : null,
      got_mr: gotMr,
      approved_by_tl: approved,
      mr_specialist_id: spec?.id ?? null,
      username_notes: i % 6 === 0 ? [{ user: "Admin", date: `${month}-${day}T10:00:00Z`, note: "Sample username note" }] : [],
      password_notes: i % 7 === 0 ? [{ user: "Admin", date: `${month}-${day}T10:00:00Z`, note: "Sample password note" }] : [],
      approved_notes: i % 8 === 0 ? [{ user: "Admin", date: `${month}-${day}T10:00:00Z`, note: "Approved after review" }] : [],
      created_at: `${month}-${day}T09:00:00Z`,
      updated_at: `${month}-${day}T09:00:00Z`,
      created_by: 1,
      specialist_name: spec?.name ?? null,
      specialist_color: spec?.bg_color ?? null,
    };
  });
}

function computeStats(entries: PortalEntry[]): PortalStats {
  return {
    total: entries.length,
    with_portal: entries.filter((e) => e.portal_link).length,
    got_mr: entries.filter((e) => e.got_mr).length,
    approved: entries.filter((e) => e.approved_by_tl).length,
  };
}

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function getPortalPageData(): Promise<PortalPageData> {
  // TODO: replace with real DB queries
  const all = buildStubEntries();
  const stats = computeStats(all);

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
    specialists: STUB_SPECIALISTS,
    availableMonths,
    permissions: derivePortalPermissions("admin"),
  };
}

export async function getPortalEntries(filters: PortalFilters): Promise<PortalPaginatedResult> {
  // TODO: replace with parameterised DB query — stub filters in-memory
  let entries = buildStubEntries();

  // Search
  if (filters.search?.trim()) {
    const q = filters.search.toLowerCase();
    entries = entries.filter((e) =>
      e.client_name.toLowerCase().includes(q) ||
      e.provider?.toLowerCase().includes(q)
    );
  }

  // Status
  if (filters.mr_status === "got") entries = entries.filter((e) => e.got_mr);
  if (filters.mr_status === "pending") entries = entries.filter((e) => !e.got_mr);

  // Month (on hearing_date)
  if (filters.month) {
    entries = entries.filter((e) => e.hearing_date?.startsWith(filters.month!));
  }

  // Specialist
  if (filters.specialist) {
    if (filters.specialist === "unassigned") entries = entries.filter((e) => !e.mr_specialist_id);
    else entries = entries.filter((e) => String(e.mr_specialist_id) === String(filters.specialist));
  }

  // Sort by entry_date
  entries.sort((a, b) => {
    const da = a.entry_date ?? "";
    const db = b.entry_date ?? "";
    return filters.sort_order === "asc" ? da.localeCompare(db) : db.localeCompare(da);
  });

  // Paginate
  const page = Math.max(1, filters.page ?? 1);
  const rawPer = filters.per_page;
  const perPage = rawPer === "all" ? entries.length || 1 : Math.min(500, (rawPer as number) ?? 50);
  const paginated = entries.slice((page - 1) * perPage, page * perPage);

  return {
    entries: paginated,
    total: entries.length,
    page,
    per_page: perPage,
    total_pages: rawPer === "all" ? 1 : Math.max(1, Math.ceil(entries.length / perPage)),
  };
}

export async function addPortalEntry(
  input: PortalAddEntryInput
): Promise<{ success: boolean; id?: number; message?: string }> {
  // TODO: INSERT INTO mr_patient_portal
  if (!input.client_name?.trim()) return { success: false, message: "Client name is required" };
  void input;
  return { success: true, id: Math.floor(Math.random() * 9000) + 1000 };
}

export async function updatePortalEntry(
  id: number,
  input: Partial<PortalAddEntryInput>
): Promise<{ success: boolean; message?: string }> {
  // TODO: UPDATE mr_patient_portal SET ... WHERE id = ?
  void id; void input;
  return { success: true };
}

export async function updatePortalField(
  id: number,
  field: string,
  value: string | number | boolean | null,
): Promise<{ success: boolean; message?: string }> {
  const allowed = [
    "entry_date","hearing_date","client_name","provider","mycase_link",
    "portal_link","portal_username","portal_password","got_mr","approved_by_tl","mr_specialist_id",
  ];
  if (!allowed.includes(field)) return { success: false, message: "Invalid field" };
  void id; void value;
  return { success: true };
}

export async function deletePortalEntry(id: number): Promise<{ success: boolean; message?: string }> {
  // TODO: DELETE FROM mr_patient_portal WHERE id = ?
  void id;
  return { success: true };
}

export async function getPortalNotes(
  id: number,
  field: "username" | "password" | "approved"
): Promise<{ success: boolean; notes?: PortalNote[]; client_name?: string; provider?: string }> {
  // TODO: SELECT <field>_notes FROM mr_patient_portal WHERE id = ?
  void id; void field;
  return { success: true, notes: [], client_name: "Demo Client", provider: "Demo Provider" };
}

export async function addPortalNote(
  id: number,
  field: "username" | "password" | "approved",
  note: string
): Promise<{ success: boolean; message?: string }> {
  // TODO: prepend to JSON array in <field>_notes column
  if (!note.trim()) return { success: false, message: "Note text is required" };
  void id; void field;
  return { success: true };
}

export async function getPortalActivityLog(filters: {
  page?: number;
  date_range?: "all" | "today" | "week" | "month";
  user_id?: string;
}): Promise<{ entries: PortalActivityEntry[]; total: number; total_pages: number }> {
  // TODO: SELECT FROM activity_log WHERE action IN ('portal_entry_created', ...)
  void filters;
  return { entries: [], total: 0, total_pages: 1 };
}

export async function getPortalActivityUsers(): Promise<Array<{ id: number; full_name: string }>> {
  // TODO: SELECT DISTINCT users from portal activity_log
  return [];
}
