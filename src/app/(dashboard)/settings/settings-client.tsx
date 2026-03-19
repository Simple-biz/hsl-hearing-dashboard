"use client";

import { useState, useTransition } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  Stethoscope,
  Settings,
  Calendar,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveConfigOption,
  toggleConfigOption,
  deleteConfigOption,
  saveMrTeam,
  toggleMrTeam,
  deleteMrTeam,
  getTeamMembers,
  saveTeamMember,
  deleteTeamMember,
  saveMrSpecialist,
  toggleMrSpecialist,
  deleteMrSpecialist,
  saveFederalHoliday,
  deleteFederalHoliday,
  saveRepDocsAssignee,
  toggleRepDocsAssignee,
  deleteRepDocsAssignee,
} from "@/app/(dashboard)/admin/actions";
import type {
  ConfigOption,
  MrTeam,
  MrTeamMember,
  MrSpecialist,
  FederalHoliday,
  RepDocsAssignee,
} from "@/app/(dashboard)/admin/actions";
import type { UserRole } from "@/lib/roles";

const CONFIG_TYPES = [
  {
    key: "manner_of_appearance",
    label: "Manner of Appearance (MOA)",
    hasColor: true,
  },
  { key: "hearing_decision_status", label: "Decision Status", hasColor: true },
  { key: "medical_record_status", label: "MR Status", hasColor: true },
  { key: "brief_assignment", label: "Brief Assignment", hasColor: false },
  { key: "rfc_status", label: "RFC Status", hasColor: true },
  { key: "rfc_document_type", label: "RFC Document Type", hasColor: true },
  { key: "rfc_method_received", label: "RFC Method Received", hasColor: true },
];

const TEAM_TYPES = [
  { value: "color_team", label: "Color Team" },
  { value: "leadership_lead", label: "Team Lead" },
  { value: "leadership_asst", label: "Asst. Team Lead" },
  { value: "shared", label: "Shared" },
  { value: "mr_specialist", label: "MR Specialist" },
  { value: "leadership", label: "Leadership" },
];

const TEAM_COLORS = [
  "blue",
  "orange",
  "green",
  "yellow",
  "purple",
  "red",
  "pink",
  "teal",
  "indigo",
  "cyan",
];

// Hex color palette for config options (MR Status, RFC types, etc.)
const COLOR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#991b1b",
  "#c2410c",
  "#92400e",
  "#065f46",
  "#0f766e",
  "#0e7490",
  "#1e40af",
  "#3730a3",
  "#5b21b6",
  "#9d174d",
  "#fca5a5",
  "#fdba74",
  "#fde047",
  "#86efac",
  "#5eead4",
  "#67e8f9",
  "#93c5fd",
  "#a5b4fc",
  "#c4b5fd",
  "#f9a8d4",
  "#e5e7eb",
  "#d1d5db",
  "#9ca3af",
  "#6b7280",
  "#374151",
];

const TEAM_TYPE_COLORS: Record<string, string> = {
  color_team:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  leadership_lead:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  leadership_asst:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  shared:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  mr_specialist:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  leadership:
    "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
};

// ── Shared components ──
function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-xl border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <Separator />
        {children}
      </div>
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        active
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300"
          : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-emerald-500" : "bg-zinc-400",
        )}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

interface Props {
  configOptions: ConfigOption[];
  mrTeams: MrTeam[];
  holidays: FederalHoliday[];
  assignees: RepDocsAssignee[];
  specialists: MrSpecialist[];
  userRole: string;
}

export function SettingsClient({
  configOptions: initConfig,
  mrTeams: initTeams,
  holidays: initHolidays,
  assignees: initAssignees,
  specialists: initSpecialists,
  userRole,
}: Props) {
  // Tab visibility matching PHP settings.php:
  // MR Teams: admin, manager, mr_admin, mr_lead (NOT hearings_admin)
  // Config Options, Federal Holidays, Rep Docs Assignees: admin, manager, hearings_admin (NOT mr_admin, mr_lead)
  const canSeeMrTeams = [
    "system_admin",
    "admin",
    "manager",
    "mr_admin",
    "mr_lead",
  ].includes(userRole);
  const canSeeConfigTabs = [
    "system_admin",
    "admin",
    "manager",
    "hearings_admin",
  ].includes(userRole);

  const allTabs = [
    canSeeMrTeams && { key: "teams", label: "MR Teams", icon: Stethoscope },
    canSeeConfigTabs && {
      key: "config",
      label: "Config Options",
      icon: Settings,
    },
    canSeeConfigTabs && {
      key: "holidays",
      label: "Federal Holidays",
      icon: Calendar,
    },
    canSeeConfigTabs && {
      key: "assignees",
      label: "Rep Docs Assignees",
      icon: ClipboardList,
    },
  ].filter(Boolean) as {
    key: string;
    label: string;
    icon: typeof Stethoscope;
  }[];

  const [tab, setTab] = useState(allTabs[0]?.key || "teams");
  const [configOptions, setConfigOptions] = useState(initConfig);
  const [mrTeams, setMrTeams] = useState(initTeams);
  const [holidays, setHolidays] = useState(initHolidays);
  const [assignees, setAssignees] = useState(initAssignees);
  const [specialists, setSpecialists] = useState(initSpecialists);
  const [, startTransition] = useTransition();

  return (
    <>
      <AppHeader
        title="Settings"
        subtitle="Configure dropdown options, teams & holidays"
      />
      <div className="flex flex-col gap-4 p-4 lg:p-6">
        <DashboardNav userRole={userRole as UserRole} />
        <div className="flex items-center gap-4 border-b">
          {allTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
        {tab === "teams" && canSeeMrTeams && (
          <TeamsTab
            teams={mrTeams}
            setTeams={setMrTeams}
            configOptions={configOptions}
            setConfigOptions={setConfigOptions}
            specialists={specialists}
            setSpecialists={setSpecialists}
            startTransition={startTransition}
          />
        )}
        {tab === "config" && canSeeConfigTabs && (
          <ConfigTab
            options={configOptions}
            setOptions={setConfigOptions}
            startTransition={startTransition}
          />
        )}
        {tab === "holidays" && canSeeConfigTabs && (
          <HolidaysTab
            holidays={holidays}
            setHolidays={setHolidays}
            startTransition={startTransition}
          />
        )}
        {tab === "assignees" && canSeeConfigTabs && (
          <AssigneesTab
            assignees={assignees}
            setAssignees={setAssignees}
            startTransition={startTransition}
          />
        )}
      </div>
    </>
  );
}

// ═══════════ MR TEAMS TAB ═══════════
function TeamsTab({
  teams,
  setTeams,
  configOptions,
  setConfigOptions,
  specialists,
  setSpecialists,
  startTransition,
}: {
  teams: MrTeam[];
  setTeams: (t: MrTeam[]) => void;
  configOptions: ConfigOption[];
  setConfigOptions: (o: ConfigOption[]) => void;
  specialists: MrSpecialist[];
  setSpecialists: (s: MrSpecialist[]) => void;
  startTransition: (fn: () => void) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<MrTeam | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [members, setMembers] = useState<Record<number, MrTeamMember[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<number | null>(null);
  const [addName, setAddName] = useState("");
  const [addColor, setAddColor] = useState("");
  const [addType, setAddType] = useState("color_team");
  const [addAssignable, setAddAssignable] = useState(true);
  const [addMemberTeamId, setAddMemberTeamId] = useState<number | null>(null);
  const [addMemberName, setAddMemberName] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("");

  const handleAdd = () => {
    if (!addName.trim()) return;
    startTransition(async () => {
      const id = await saveMrTeam({
        team_name: addName.trim(),
        team_color: addColor || undefined,
        team_type: addType,
        is_assignable: addAssignable,
      });
      setTeams([
        ...teams,
        {
          id,
          team_name: addName.trim(),
          team_color: addColor || null,
          team_type: addType,
          is_assignable: addAssignable,
          is_active: true,
          display_order: teams.length + 1,
          member_count: 0,
        },
      ]);
      setAddName("");
      setAddColor("");
      setAddType("color_team");
      setAddAssignable(true);
      setShowAdd(false);
    });
  };
  const handleEditSave = () => {
    if (!editing) return;
    startTransition(async () => {
      await saveMrTeam({
        id: editing.id,
        team_name: editing.team_name,
        team_color: editing.team_color || undefined,
        team_type: editing.team_type,
        is_assignable: editing.is_assignable,
      });
      setTeams(teams.map((t) => (t.id === editing.id ? editing : t)));
      setEditing(null);
    });
  };
  const toggleExpand = (teamId: number) => {
    if (expandedId === teamId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(teamId);
    if (!members[teamId]) {
      setLoadingMembers(teamId);
      getTeamMembers(teamId).then((m) => {
        setMembers((prev) => ({ ...prev, [teamId]: m }));
        setLoadingMembers(null);
      });
    }
  };
  const handleAddMember = (teamId: number) => {
    if (!addMemberName.trim() || !addMemberRole.trim()) return;
    startTransition(async () => {
      await saveTeamMember({
        team_id: teamId,
        member_name: addMemberName.trim(),
        role: addMemberRole.trim(),
      });
      const updated = await getTeamMembers(teamId);
      setMembers((prev) => ({ ...prev, [teamId]: updated }));
      setTeams(
        teams.map((t) =>
          t.id === teamId ? { ...t, member_count: t.member_count + 1 } : t,
        ),
      );
      setAddMemberName("");
      setAddMemberRole("");
      setAddMemberTeamId(null);
    });
  };
  const handleDeleteMember = (memberId: number, teamId: number) => {
    startTransition(async () => {
      await deleteTeamMember(memberId);
      setMembers((prev) => ({
        ...prev,
        [teamId]: (prev[teamId] || []).filter((m) => m.id !== memberId),
      }));
      setTeams(
        teams.map((t) =>
          t.id === teamId
            ? { ...t, member_count: Math.max(0, t.member_count - 1) }
            : t,
        ),
      );
    });
  };

  const [subTab, setSubTab] = useState("teams");

  const subTabs = [
    { key: "teams", label: "Teams", count: teams.length },
    {
      key: "mr_status",
      label: "MR Status",
      count: configOptions.filter(
        (o) => o.option_type === "medical_record_status",
      ).length,
    },
    { key: "specialists", label: "Specialists", count: specialists.length },
    {
      key: "rfc_doc",
      label: "RFC Doc Types",
      count: configOptions.filter((o) => o.option_type === "rfc_document_type")
        .length,
    },
    {
      key: "rfc_method",
      label: "RFC Methods",
      count: configOptions.filter(
        (o) => o.option_type === "rfc_method_received",
      ).length,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {subTabs.map((st) => (
          <button
            key={st.key}
            onClick={() => setSubTab(st.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
              subTab === st.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {st.label} <span className="opacity-60">({st.count})</span>
          </button>
        ))}
      </div>

      {/* Teams sub-tab */}
      {subTab === "teams" && (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" /> Medical Records
              Teams{" "}
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-normal">
                {teams.length}
              </span>
            </CardTitle>
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => {
                setAddName("");
                setAddColor("");
                setAddType("color_team");
                setAddAssignable(true);
                setShowAdd(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Team
            </Button>
          </CardHeader>
          <Separator />
          <div className="max-h-150 overflow-y-auto divide-y">
            {[...teams].sort(
              (a, b) => Number(b.is_active) - Number(a.is_active),
            ).length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No teams configured yet.
              </div>
            ) : (
              [...teams]
                .sort((a, b) => Number(b.is_active) - Number(a.is_active))
                .map((team) => (
                  <div
                    key={team.id}
                    className={cn(!team.is_active && "opacity-50")}
                  >
                    <div
                      className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => toggleExpand(team.id)}
                    >
                      {team.team_color && (
                        <span
                          className="inline-block h-4 w-4 rounded-full shrink-0 ring-1 ring-black/10"
                          style={{ backgroundColor: team.team_color }}
                        />
                      )}
                      <span className="text-sm font-medium">
                        {team.team_name}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          TEAM_TYPE_COLORS[team.team_type] || "bg-muted",
                        )}
                      >
                        {TEAM_TYPES.find((t) => t.value === team.team_type)
                          ?.label || team.team_type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {team.member_count}m
                      </span>
                      {!team.is_assignable && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          N/A
                        </span>
                      )}
                      <div
                        className="ml-auto flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <StatusDot active={team.is_active} />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2.5"
                          onClick={() => setEditing(team)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-7 text-xs px-2.5",
                            team.is_active
                              ? "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              : "text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/30",
                          )}
                          onClick={() => {
                            startTransition(async () => {
                              await toggleMrTeam(team.id, !team.is_active);
                              setTeams(
                                teams.map((t) =>
                                  t.id === team.id
                                    ? { ...t, is_active: !team.is_active }
                                    : t,
                                ),
                              );
                            });
                          }}
                        >
                          {team.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() => {
                            if (confirm(`Delete "${team.team_name}"?`))
                              startTransition(async () => {
                                await deleteMrTeam(team.id);
                                setTeams(teams.filter((t) => t.id !== team.id));
                              });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            expandedId !== team.id && "-rotate-90",
                          )}
                        />
                      </div>
                    </div>
                    {expandedId === team.id && (
                      <div className="bg-muted/30 border-t px-6 py-3">
                        {loadingMembers === team.id ? (
                          <p className="text-xs text-muted-foreground py-2">
                            Loading...
                          </p>
                        ) : (members[team.id] || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">
                            No members yet.
                          </p>
                        ) : (
                          <div className="divide-y divide-border/50">
                            {(members[team.id] || []).map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center py-2"
                              >
                                <span className="text-sm flex-1">
                                  {m.member_name}
                                </span>
                                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs mr-2">
                                  {m.role}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                                  onClick={() => {
                                    if (confirm(`Remove ${m.member_name}?`))
                                      handleDeleteMember(m.id, team.id);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {addMemberTeamId === team.id ? (
                          <div className="flex items-center gap-2 pt-2">
                            <Input
                              value={addMemberName}
                              onChange={(e) => setAddMemberName(e.target.value)}
                              placeholder="Name"
                              className="h-8 flex-1 text-sm"
                              autoFocus
                            />
                            <Input
                              value={addMemberRole}
                              onChange={(e) => setAddMemberRole(e.target.value)}
                              placeholder="Role"
                              className="h-8 w-35 text-sm"
                            />
                            <Button
                              size="sm"
                              className="h-8"
                              onClick={() => handleAddMember(team.id)}
                            >
                              Add
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => setAddMemberTeamId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 w-full mt-2"
                            onClick={() => {
                              setAddMemberTeamId(team.id);
                              setAddMemberName("");
                              setAddMemberRole("");
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Member
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        </Card>
      )}

      {/* MR Status sub-tab */}
      {subTab === "mr_status" && (
        <OptionCard
          title="📋 Medical Record Status"
          items={configOptions.filter(
            (o) => o.option_type === "medical_record_status",
          )}
          hasColor={true}
          onAdd={(v, c) => {
            startTransition(async () => {
              const id = await saveConfigOption({
                option_type: "medical_record_status",
                option_value: v,
                option_color: c,
              });
              setConfigOptions([
                ...configOptions,
                {
                  id,
                  option_type: "medical_record_status",
                  option_value: v,
                  option_color: c || null,
                  is_active: true,
                  display_order: 999,
                },
              ]);
            });
          }}
          onEdit={(id, v, c) => {
            startTransition(async () => {
              await saveConfigOption({
                id,
                option_type: "medical_record_status",
                option_value: v,
                option_color: c,
              });
              setConfigOptions(
                configOptions.map((o) =>
                  o.id === id
                    ? { ...o, option_value: v, option_color: c || null }
                    : o,
                ),
              );
            });
          }}
          onToggle={(id, a) => {
            startTransition(async () => {
              await toggleConfigOption(id, a);
              setConfigOptions(
                configOptions.map((o) =>
                  o.id === id ? { ...o, is_active: a } : o,
                ),
              );
            });
          }}
          onDelete={(id) => {
            startTransition(async () => {
              await deleteConfigOption(id);
              setConfigOptions(configOptions.filter((o) => o.id !== id));
            });
          }}
        />
      )}

      {/* Specialists sub-tab */}
      {subTab === "specialists" && (
        <OptionCard
          title="👤 MR Specialists"
          items={specialists.map((s) => ({
            id: s.id,
            option_value: s.name,
            option_color: s.bg_color,
            is_active: s.is_active,
          }))}
          hasColor={true}
          useColorSwatches
          onAdd={(v, c) => {
            startTransition(async () => {
              const id = await saveMrSpecialist({ name: v, bg_color: c });
              setSpecialists([
                ...specialists,
                {
                  id,
                  name: v,
                  bg_color: c || null,
                  is_active: true,
                  display_order: 999,
                },
              ]);
            });
          }}
          onEdit={(id, v, c) => {
            startTransition(async () => {
              await saveMrSpecialist({ id, name: v, bg_color: c });
              setSpecialists(
                specialists.map((s) =>
                  s.id === id ? { ...s, name: v, bg_color: c || null } : s,
                ),
              );
            });
          }}
          onToggle={(id, a) => {
            startTransition(async () => {
              await toggleMrSpecialist(id, a);
              setSpecialists(
                specialists.map((s) =>
                  s.id === id ? { ...s, is_active: a } : s,
                ),
              );
            });
          }}
          onDelete={(id) => {
            startTransition(async () => {
              await deleteMrSpecialist(id);
              setSpecialists(specialists.filter((s) => s.id !== id));
            });
          }}
        />
      )}

      {/* RFC Doc Types sub-tab */}
      {subTab === "rfc_doc" && (
        <OptionCard
          title="📄 RFC Document Types"
          items={configOptions.filter(
            (o) => o.option_type === "rfc_document_type",
          )}
          hasColor={true}
          onAdd={(v, c) => {
            startTransition(async () => {
              const id = await saveConfigOption({
                option_type: "rfc_document_type",
                option_value: v,
                option_color: c,
              });
              setConfigOptions([
                ...configOptions,
                {
                  id,
                  option_type: "rfc_document_type",
                  option_value: v,
                  option_color: c || null,
                  is_active: true,
                  display_order: 999,
                },
              ]);
            });
          }}
          onEdit={(id, v, c) => {
            startTransition(async () => {
              await saveConfigOption({
                id,
                option_type: "rfc_document_type",
                option_value: v,
                option_color: c,
              });
              setConfigOptions(
                configOptions.map((o) =>
                  o.id === id
                    ? { ...o, option_value: v, option_color: c || null }
                    : o,
                ),
              );
            });
          }}
          onToggle={(id, a) => {
            startTransition(async () => {
              await toggleConfigOption(id, a);
              setConfigOptions(
                configOptions.map((o) =>
                  o.id === id ? { ...o, is_active: a } : o,
                ),
              );
            });
          }}
          onDelete={(id) => {
            startTransition(async () => {
              await deleteConfigOption(id);
              setConfigOptions(configOptions.filter((o) => o.id !== id));
            });
          }}
        />
      )}

      {/* RFC Methods sub-tab */}
      {subTab === "rfc_method" && (
        <OptionCard
          title="📬 RFC Method Received"
          items={configOptions.filter(
            (o) => o.option_type === "rfc_method_received",
          )}
          hasColor={true}
          onAdd={(v, c) => {
            startTransition(async () => {
              const id = await saveConfigOption({
                option_type: "rfc_method_received",
                option_value: v,
                option_color: c,
              });
              setConfigOptions([
                ...configOptions,
                {
                  id,
                  option_type: "rfc_method_received",
                  option_value: v,
                  option_color: c || null,
                  is_active: true,
                  display_order: 999,
                },
              ]);
            });
          }}
          onEdit={(id, v, c) => {
            startTransition(async () => {
              await saveConfigOption({
                id,
                option_type: "rfc_method_received",
                option_value: v,
                option_color: c,
              });
              setConfigOptions(
                configOptions.map((o) =>
                  o.id === id
                    ? { ...o, option_value: v, option_color: c || null }
                    : o,
                ),
              );
            });
          }}
          onToggle={(id, a) => {
            startTransition(async () => {
              await toggleConfigOption(id, a);
              setConfigOptions(
                configOptions.map((o) =>
                  o.id === id ? { ...o, is_active: a } : o,
                ),
              );
            });
          }}
          onDelete={(id) => {
            startTransition(async () => {
              await deleteConfigOption(id);
              setConfigOptions(configOptions.filter((o) => o.id !== id));
            });
          }}
        />
      )}

      {/* Add Team Modal */}
      {showAdd && (
        <Modal title="Add Team" onClose={() => setShowAdd(false)}>
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Team Name *
              </label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g., Blue Team"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Team Type
                </label>
                <select
                  value={addType}
                  onChange={(e) => setAddType(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {TEAM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Color
                </label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {TEAM_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setAddColor(c)}
                      className={cn(
                        "h-7 w-7 rounded-full border-2 transition-all ring-1 ring-black/10",
                        addColor === c
                          ? "border-foreground scale-110"
                          : "border-transparent hover:border-muted-foreground/50",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={addAssignable}
                onChange={(e) => setAddAssignable(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />{" "}
              Can be assigned to hearings
            </label>
          </div>
          <Separator />
          <div className="flex justify-end gap-2 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd}>
              Add Team
            </Button>
          </div>
        </Modal>
      )}
      {/* Edit Team Modal */}
      {editing && (
        <Modal title="Edit Team" onClose={() => setEditing(null)}>
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Team Name *
              </label>
              <Input
                value={editing.team_name}
                onChange={(e) =>
                  setEditing({ ...editing, team_name: e.target.value })
                }
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Team Type
                </label>
                <select
                  value={editing.team_type}
                  onChange={(e) =>
                    setEditing({ ...editing, team_type: e.target.value })
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {TEAM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Color
                </label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {TEAM_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditing({ ...editing, team_color: c })}
                      className={cn(
                        "h-7 w-7 rounded-full border-2 transition-all ring-1 ring-black/10",
                        editing.team_color === c
                          ? "border-foreground scale-110"
                          : "border-transparent hover:border-muted-foreground/50",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={editing.is_assignable}
                onChange={(e) =>
                  setEditing({ ...editing, is_assignable: e.target.checked })
                }
                className="h-4 w-4 accent-primary"
              />{" "}
              Can be assigned to hearings
            </label>
          </div>
          <Separator />
          <div className="flex justify-end gap-2 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleEditSave}
            >
              Update
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════ REUSABLE OPTION CARD ═══════════
function ColorPicker({
  value,
  onChange,
  useTeamColors,
}: {
  value: string;
  onChange: (c: string) => void;
  useTeamColors?: boolean;
}) {
  const palette = useTeamColors ? TEAM_COLORS : COLOR_PALETTE;
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium">Color</label>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <button
          onClick={() => onChange("")}
          className={cn(
            "h-7 w-7 rounded-full border-2 transition-all ring-1 ring-black/10 bg-white dark:bg-zinc-800 flex items-center justify-center text-[10px] text-muted-foreground",
            !value
              ? "border-foreground scale-110"
              : "border-transparent hover:border-muted-foreground/50",
          )}
        >
          ✕
        </button>
        {palette.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={cn(
              "h-7 w-7 rounded-full border-2 transition-all ring-1 ring-black/10",
              value === c
                ? "border-foreground scale-110"
                : "border-transparent hover:border-muted-foreground/50",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}

function OptionCard({
  title,
  items,
  hasColor,
  useColorSwatches,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: {
  title: string;
  items: {
    id: number;
    option_value: string;
    option_color: string | null;
    is_active: boolean;
  }[];
  hasColor: boolean;
  useColorSwatches?: boolean;
  onAdd: (value: string, color?: string) => void;
  onEdit: (id: number, value: string, color?: string) => void;
  onToggle: (id: number, active: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<{
    id: number;
    option_value: string;
    option_color: string | null;
  } | null>(null);
  const [newValue, setNewValue] = useState("");
  const [newColor, setNewColor] = useState("");

  const handleAdd = () => {
    if (!newValue.trim()) return;
    onAdd(newValue.trim(), newColor || undefined);
    setNewValue("");
    setNewColor("");
    setShowModal(false);
  };
  const handleEditSave = () => {
    if (!editItem) return;
    onEdit(
      editItem.id,
      editItem.option_value,
      editItem.option_color || undefined,
    );
    setEditItem(null);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <CardTitle className="text-base">
          {title}{" "}
          <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-normal">
            {items.length}
          </span>
        </CardTitle>
        <Button
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => {
            setNewValue("");
            setNewColor("");
            setShowModal(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </CardHeader>
      <Separator />
      <div className="divide-y">
        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No items yet.
          </div>
        ) : (
          [...items]
            .sort((a, b) => Number(b.is_active) - Number(a.is_active))
            .map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/40 transition-colors",
                  !item.is_active && "opacity-50",
                )}
              >
                {item.option_color && (
                  <span
                    className="h-4 w-4 rounded-full shrink-0 ring-1 ring-black/10"
                    style={{ backgroundColor: item.option_color }}
                  />
                )}
                <span
                  className={cn(
                    "flex-1 text-sm",
                    !item.is_active && "line-through text-muted-foreground",
                  )}
                >
                  {item.option_value}
                </span>
                <StatusDot active={item.is_active} />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() =>
                    setEditItem({
                      id: item.id,
                      option_value: item.option_value,
                      option_color: item.option_color,
                    })
                  }
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 text-xs px-2.5",
                    item.is_active
                      ? "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      : "text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/30",
                  )}
                  onClick={() => onToggle(item.id, !item.is_active)}
                >
                  {item.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={() => {
                    if (confirm(`Delete "${item.option_value}"?`))
                      onDelete(item.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
        )}
      </div>

      {showModal && (
        <Modal
          title={`Add ${title.replace(/^[^\s]+\s/, "")}`}
          onClose={() => setShowModal(false)}
        >
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Value *
              </label>
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="Enter value"
                className="h-9 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !hasColor) handleAdd();
                }}
              />
            </div>
            {hasColor && (
              <ColorPicker
                value={newColor}
                onChange={setNewColor}
                useTeamColors={useColorSwatches}
              />
            )}
          </div>
          <Separator />
          <div className="flex justify-end gap-2 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd}>
              Add
            </Button>
          </div>
        </Modal>
      )}

      {editItem && (
        <Modal
          title={`Edit ${title.replace(/^[^\s]+\s/, "")}`}
          onClose={() => setEditItem(null)}
        >
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Value *
              </label>
              <Input
                value={editItem.option_value}
                onChange={(e) =>
                  setEditItem({ ...editItem, option_value: e.target.value })
                }
                className="h-9 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !hasColor) handleEditSave();
                }}
              />
            </div>
            {hasColor && (
              <ColorPicker
                value={editItem.option_color || ""}
                onChange={(c) =>
                  setEditItem({ ...editItem, option_color: c || null })
                }
                useTeamColors={useColorSwatches}
              />
            )}
          </div>
          <Separator />
          <div className="flex justify-end gap-2 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditItem(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleEditSave}
            >
              Update
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

// ═══════════ CONFIG OPTIONS TAB ═══════════
function ConfigTab({
  options,
  setOptions,
  startTransition,
}: {
  options: ConfigOption[];
  setOptions: (o: ConfigOption[]) => void;
  startTransition: (fn: () => void) => void;
}) {
  const [activeType, setActiveType] = useState(CONFIG_TYPES[0].key);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<ConfigOption | null>(null);
  const [newValue, setNewValue] = useState("");
  const [newColor, setNewColor] = useState("");
  const typeConfig = CONFIG_TYPES.find((t) => t.key === activeType)!;
  const items = options.filter((o) => o.option_type === activeType);

  const handleAdd = () => {
    if (!newValue.trim()) return;
    startTransition(async () => {
      const id = await saveConfigOption({
        option_type: activeType,
        option_value: newValue.trim(),
        option_color: newColor || undefined,
      });
      setOptions([
        ...options,
        {
          id,
          option_type: activeType,
          option_value: newValue.trim(),
          option_color: newColor || null,
          is_active: true,
          display_order: items.length + 1,
        },
      ]);
      setNewValue("");
      setNewColor("");
      setShowAddModal(false);
    });
  };

  const handleEditSave = () => {
    if (!editItem) return;
    startTransition(async () => {
      await saveConfigOption({
        id: editItem.id,
        option_type: editItem.option_type,
        option_value: editItem.option_value,
        option_color: editItem.option_color || undefined,
      });
      setOptions(options.map((o) => (o.id === editItem.id ? editItem : o)));
      setEditItem(null);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure dropdown values used across the dashboard.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {CONFIG_TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveType(t.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
              activeType === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}{" "}
            <span className="opacity-60">
              ({options.filter((o) => o.option_type === t.key).length})
            </span>
          </button>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
          <CardTitle className="text-base">
            {typeConfig.label}{" "}
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-normal">
              {items.length}
            </span>
          </CardTitle>
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              setNewValue("");
              setNewColor("");
              setShowAddModal(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </CardHeader>
        <Separator />
        <div className="divide-y">
          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No options for this type.
            </div>
          ) : (
            [...items]
              .sort((a, b) => Number(b.is_active) - Number(a.is_active))
              .map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/40 transition-colors",
                    !item.is_active && "opacity-50",
                  )}
                >
                  {item.option_color && (
                    <span
                      className="h-4 w-4 rounded-full shrink-0 ring-1 ring-black/10"
                      style={{ backgroundColor: item.option_color }}
                    />
                  )}
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      !item.is_active && "line-through text-muted-foreground",
                    )}
                  >
                    {item.option_value}
                  </span>
                  <StatusDot active={item.is_active} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setEditItem(item)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 text-xs px-2.5",
                      item.is_active
                        ? "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        : "text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/30",
                    )}
                    onClick={() => {
                      startTransition(async () => {
                        await toggleConfigOption(item.id, !item.is_active);
                        setOptions(
                          options.map((o) =>
                            o.id === item.id
                              ? { ...o, is_active: !item.is_active }
                              : o,
                          ),
                        );
                      });
                    }}
                  >
                    {item.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => {
                      if (confirm(`Delete "${item.option_value}"?`))
                        startTransition(async () => {
                          await deleteConfigOption(item.id);
                          setOptions(options.filter((o) => o.id !== item.id));
                        });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
          )}
        </div>
      </Card>

      {showAddModal && (
        <Modal
          title={`Add ${typeConfig.label}`}
          onClose={() => setShowAddModal(false)}
        >
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Value *
              </label>
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="Enter value"
                className="h-9 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
            </div>
            {typeConfig.hasColor && (
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Color
                </label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    onClick={() => setNewColor("")}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-all ring-1 ring-black/10 bg-white dark:bg-zinc-800 flex items-center justify-center text-[10px] text-muted-foreground",
                      !newColor
                        ? "border-foreground scale-110"
                        : "border-transparent hover:border-muted-foreground/50",
                    )}
                  >
                    ✕
                  </button>
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={cn(
                        "h-7 w-7 rounded-full border-2 transition-all ring-1 ring-black/10",
                        newColor === c
                          ? "border-foreground scale-110"
                          : "border-transparent hover:border-muted-foreground/50",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <Separator />
          <div className="flex justify-end gap-2 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd}>
              Add
            </Button>
          </div>
        </Modal>
      )}

      {editItem && (
        <Modal
          title={`Edit ${typeConfig.label}`}
          onClose={() => setEditItem(null)}
        >
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Value *
              </label>
              <Input
                value={editItem.option_value}
                onChange={(e) =>
                  setEditItem({ ...editItem, option_value: e.target.value })
                }
                className="h-9 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEditSave();
                }}
              />
            </div>
            {typeConfig.hasColor && (
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Color
                </label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    onClick={() =>
                      setEditItem({ ...editItem, option_color: "" })
                    }
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-all ring-1 ring-black/10 bg-white dark:bg-zinc-800 flex items-center justify-center text-[10px] text-muted-foreground",
                      !editItem.option_color
                        ? "border-foreground scale-110"
                        : "border-transparent hover:border-muted-foreground/50",
                    )}
                  >
                    ✕
                  </button>
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() =>
                        setEditItem({ ...editItem, option_color: c })
                      }
                      className={cn(
                        "h-7 w-7 rounded-full border-2 transition-all ring-1 ring-black/10",
                        editItem.option_color === c
                          ? "border-foreground scale-110"
                          : "border-transparent hover:border-muted-foreground/50",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <Separator />
          <div className="flex justify-end gap-2 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditItem(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleEditSave}
            >
              Update
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════ HOLIDAYS TAB ═══════════
function HolidaysTab({
  holidays,
  setHolidays,
  startTransition,
}: {
  holidays: FederalHoliday[];
  setHolidays: (h: FederalHoliday[]) => void;
  startTransition: (fn: () => void) => void;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<FederalHoliday | null>(null);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [yearFilter, setYearFilter] = useState(
    String(new Date().getFullYear()),
  );

  const years = [...new Set(holidays.map((h) => h.year))].sort((a, b) => b - a);
  const filtered = yearFilter
    ? holidays.filter((h) => h.year === parseInt(yearFilter))
    : holidays;

  const handleAdd = () => {
    if (!newName.trim() || !newDate) return;
    startTransition(async () => {
      const id = await saveFederalHoliday({
        holiday_name: newName.trim(),
        holiday_date: newDate,
      });
      setHolidays([
        ...holidays,
        {
          id,
          holiday_name: newName.trim(),
          holiday_date: newDate,
          year: parseInt(newDate.split("-")[0]),
        },
      ]);
      setNewName("");
      setNewDate("");
      setShowAddModal(false);
    });
  };

  const handleEditSave = () => {
    if (!editItem) return;
    startTransition(async () => {
      await saveFederalHoliday({
        id: editItem.id,
        holiday_name: editItem.holiday_name,
        holiday_date: editItem.holiday_date,
      });
      setHolidays(
        holidays.map((h) =>
          h.id === editItem.id
            ? {
                ...editItem,
                year: parseInt(editItem.holiday_date.split("-")[0]),
              }
            : h,
        ),
      );
      setEditItem(null);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Federal holidays are excluded from the auto-assign engine.
      </p>
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> Federal Holidays{" "}
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-normal">
              {filtered.length}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              <option value="">All Years</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => {
                setNewName("");
                setNewDate("");
                setShowAddModal(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </CardHeader>
        <Separator />
        <div className="divide-y">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No holidays found.
            </div>
          ) : (
            filtered.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <span className="rounded-md bg-muted px-2.5 py-0.5 text-xs font-mono tabular-nums">
                  {h.holiday_date}
                </span>
                <span className="flex-1 text-sm font-medium">
                  {h.holiday_name}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setEditItem(h)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={() => {
                    if (confirm(`Delete "${h.holiday_name}"?`))
                      startTransition(async () => {
                        await deleteFederalHoliday(h.id);
                        setHolidays(holidays.filter((x) => x.id !== h.id));
                      });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {showAddModal && (
        <Modal
          title="Add Federal Holiday"
          onClose={() => setShowAddModal(false)}
        >
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Holiday Name *
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Christmas Day"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Date *</label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <Separator />
          <div className="flex justify-end gap-2 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd}>
              Add Holiday
            </Button>
          </div>
        </Modal>
      )}

      {editItem && (
        <Modal title="Edit Holiday" onClose={() => setEditItem(null)}>
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Holiday Name *
              </label>
              <Input
                value={editItem.holiday_name}
                onChange={(e) =>
                  setEditItem({ ...editItem, holiday_name: e.target.value })
                }
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Date *</label>
              <Input
                type="date"
                value={editItem.holiday_date}
                onChange={(e) =>
                  setEditItem({ ...editItem, holiday_date: e.target.value })
                }
                className="h-9 text-sm"
              />
            </div>
          </div>
          <Separator />
          <div className="flex justify-end gap-2 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditItem(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleEditSave}
            >
              Update
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════ REP DOCS ASSIGNEES TAB ═══════════
function AssigneesTab({
  assignees,
  setAssignees,
  startTransition,
}: {
  assignees: RepDocsAssignee[];
  setAssignees: (a: RepDocsAssignee[]) => void;
  startTransition: (fn: () => void) => void;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<RepDocsAssignee | null>(null);
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;
    startTransition(async () => {
      const id = await saveRepDocsAssignee({ name: newName.trim() });
      setAssignees([
        ...assignees,
        {
          id,
          name: newName.trim(),
          is_active: true,
          display_order: assignees.length + 1,
        },
      ]);
      setNewName("");
      setShowAddModal(false);
    });
  };

  const handleEditSave = () => {
    if (!editItem) return;
    startTransition(async () => {
      await saveRepDocsAssignee({ id: editItem.id, name: editItem.name });
      setAssignees(assignees.map((a) => (a.id === editItem.id ? editItem : a)));
      setEditItem(null);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        People who can be assigned to rep document preparation tasks.
      </p>
      <Card className="shadow-sm max-w-2xl">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" /> Assignees{" "}
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-normal">
              {assignees.length}
            </span>
          </CardTitle>
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              setNewName("");
              setShowAddModal(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </CardHeader>
        <Separator />
        <div className="divide-y">
          {assignees.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No assignees yet.
            </div>
          ) : (
            [...assignees]
              .sort((a, b) => Number(b.is_active) - Number(a.is_active))
              .map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/40 transition-colors",
                    !a.is_active && "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      !a.is_active && "line-through text-muted-foreground",
                    )}
                  >
                    {a.name}
                  </span>
                  <StatusDot active={a.is_active} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setEditItem(a)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 text-xs px-2.5",
                      a.is_active
                        ? "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        : "text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/30",
                    )}
                    onClick={() => {
                      startTransition(async () => {
                        await toggleRepDocsAssignee(a.id, !a.is_active);
                        setAssignees(
                          assignees.map((x) =>
                            x.id === a.id
                              ? { ...x, is_active: !a.is_active }
                              : x,
                          ),
                        );
                      });
                    }}
                  >
                    {a.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => {
                      if (confirm(`Delete "${a.name}"?`))
                        startTransition(async () => {
                          await deleteRepDocsAssignee(a.id);
                          setAssignees(assignees.filter((x) => x.id !== a.id));
                        });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
          )}
        </div>
      </Card>

      {showAddModal && (
        <Modal
          title="Add Rep Docs Assignee"
          onClose={() => setShowAddModal(false)}
        >
          <div className="px-5 py-4">
            <label className="mb-1.5 block text-xs font-medium">Name *</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter name"
              className="h-9 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
          </div>
          <Separator />
          <div className="flex justify-end gap-2 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd}>
              Add
            </Button>
          </div>
        </Modal>
      )}

      {editItem && (
        <Modal title="Edit Assignee" onClose={() => setEditItem(null)}>
          <div className="px-5 py-4">
            <label className="mb-1.5 block text-xs font-medium">Name *</label>
            <Input
              value={editItem.name}
              onChange={(e) =>
                setEditItem({ ...editItem, name: e.target.value })
              }
              className="h-9 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEditSave();
              }}
            />
          </div>
          <Separator />
          <div className="flex justify-end gap-2 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditItem(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleEditSave}
            >
              Update
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
