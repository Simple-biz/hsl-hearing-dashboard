"use server";

// Re-export all types so existing imports (`import type { X } from "./action"`) keep working.
export type {
  UserRole,
  Permissions,
  MrTeam,
  Hearing,
  MrStatusByTeam,
  TeamAssignment,
  MonthlyTeamStat,
  AssignedByMonthRow,
  RoundRobinState,
  NotificationItem,
  ActivityLogItem,
  PostHrgNote,
  MrPivotStatCards,
  MrPivotPageData,
  HearingFilters,
  PaginatedHearingsResult,
  TeamStatsData,
} from "./types";

import { derivePermissionsWithOverrides } from "./types";
import type { UserRole } from "./types";
import { getUserFieldOverridesPlain } from "@/lib/field-access";
import type {
  MrTeam,
  Hearing,
  MrPivotPageData,
  MrPivotStatCards,
  HearingFilters,
  PaginatedHearingsResult,
  RoundRobinState,
  MonthlyTeamStat,
  TeamStatsData,
  NotificationItem,
  ActivityLogItem,
  PostHrgNote,
} from "./types";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// ─── Internal helper — writes to activity_log, matching PHP's logActivity() ──
async function logActivity(
  action: string,
  details: string,
): Promise<void> {
  try {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    await db.query(
      `INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)`,
      [userId, action, details],
    );
  } catch {
    // Never let logging failures break the mutation
  }
}

type HearingSyncEventType = "create" | "update" | "delete";

type SyncEventRow = Record<string, unknown>;
type SyncEventQueryRunner = {
  query: <T extends SyncEventRow = SyncEventRow>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

type HearingListPreview = {
  id: number;
  claimant: string;
  hearing_date: string;
};

type HearingDatePreview = {
  claimant: string;
  hearing_date: string;
};

type HearingSyncPayloadRow = {
  id: string;
  claimant: string;
  ssn_last_4: string;
  claimant_key: string;
  claim_type: string;
  hearing_date: string;
  hearing_time: string;
  time_zone: string;
  converted_time_est: string;
  alj: string;
  medical_expert: string;
  vocational_expert: string;
  hearing_decision_status: string;
  medical_record_status: string;
  mr_team_name: string;
  manner_of_appearance: string;
  post_hrg_deadline: string;
  task_assigned: boolean;
  five_day_notice: boolean;
  medical_record_link: string;
};

async function recordHearingSyncEvent(
  client: SyncEventQueryRunner,
  {
    hearingId,
    eventType,
    payload = null,
    changedFields = null,
    source = "medical_records_page",
  }: {
    hearingId: number;
    eventType: HearingSyncEventType;
    payload?: Record<string, unknown> | null;
    changedFields?: Record<string, unknown> | string[] | null;
    source?: string;
  },
) {
  await client.query(
    `
      INSERT INTO hearing_sync_events (
        hearing_id,
        event_type,
        payload,
        changed_fields,
        source
      )
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
    `,
    [
      hearingId,
      eventType,
      payload ? JSON.stringify(payload) : null,
      changedFields ? JSON.stringify(changedFields) : null,
      source,
    ],
  );
}

async function fetchHearingSyncPayload(
  client: SyncEventQueryRunner,
  hearingId: number,
): Promise<HearingSyncPayloadRow | null> {
  const { rows } = await client.query<HearingSyncPayloadRow>(
    `
      SELECT
        h.id::text                               AS id,
        COALESCE(h.claimant, '')                 AS claimant,
        COALESCE(h.ssn_last_4, '')               AS ssn_last_4,
        CASE
          WHEN NULLIF(TRIM(COALESCE(h.ssn_last_4, '')), '') IS NULL THEN ''
          ELSE regexp_replace(lower(trim(COALESCE(h.claimant, ''))), '[[:space:]]+', ' ', 'g')
            || '|' || trim(COALESCE(h.ssn_last_4, ''))
        END                                      AS claimant_key,
        COALESCE(h.claim_type, '')               AS claim_type,
        COALESCE(h.hearing_date::text, '')       AS hearing_date,
        COALESCE(h.hearing_time::text, '')       AS hearing_time,
        COALESCE(h.time_zone, '')                AS time_zone,
        COALESCE(h.converted_time_est::text, '') AS converted_time_est,
        COALESCE(h.alj, '')                      AS alj,
        COALESCE(h.medical_expert, '')           AS medical_expert,
        COALESCE(h.vocational_expert, '')        AS vocational_expert,
        COALESCE(h.hearing_decision_status, '')  AS hearing_decision_status,
        COALESCE(h.medical_record_status, '')    AS medical_record_status,
        COALESCE(t.team_name, '')                AS mr_team_name,
        COALESCE(h.manner_of_appearance, '')     AS manner_of_appearance,
        COALESCE(h.post_hrg_deadline::text, '')  AS post_hrg_deadline,
        COALESCE(h.task_assigned, false)         AS task_assigned,
        COALESCE(h.five_day_notice, false)       AS five_day_notice,
        COALESCE(h.medical_record_link, '')      AS medical_record_link
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE h.id = $1
    `,
    [hearingId],
  );

  return rows[0] ?? null;
}

async function recordHearingUpdateEvent(
  client: SyncEventQueryRunner,
  {
    hearingId,
    changedFields,
  }: {
    hearingId: number;
    changedFields: Record<string, unknown>;
  },
) {
  const payload = await fetchHearingSyncPayload(client, hearingId);
  if (!payload) return;

  await recordHearingSyncEvent(client, {
    hearingId,
    eventType: "update",
    payload,
    changedFields,
  });
}


type SyncMutationResult<T> = {
  payload: HearingSyncPayloadRow;
  oldValue: T | null;
};

// IMPORTANT:
// - only pass hardcoded SQL fragments from this file
// - never pass user-provided column names or SQL into this helper
async function updateSingleFieldAndRecordEvent<T>({
  client,
  hearingId,
  oldValueColumnSql,
  updateSetSql,
  updateParams,
  changedField,
  newValue,
}: {
  client: SyncEventQueryRunner;
  hearingId: number;
  oldValueColumnSql: string;
  updateSetSql: string;
  updateParams: unknown[];
  changedField: string;
  newValue: unknown;
}): Promise<SyncMutationResult<T>> {
  type Row = HearingSyncPayloadRow & { old_value: T | null };

  const { rows } = await client.query<Row>(
    `
      WITH previous AS (
        SELECT
          h.id,
          ${oldValueColumnSql} AS old_value
        FROM hearings h
        WHERE h.id = $1
        FOR UPDATE
      ),
      updated AS (
        UPDATE hearings h
        SET
          ${updateSetSql},
          updated_at = NOW()
        FROM previous p
        WHERE h.id = p.id
        RETURNING
          h.id,
          h.claimant,
          h.ssn_last_4,
          h.claim_type,
          h.hearing_date,
          h.hearing_time,
          h.time_zone,
          h.converted_time_est,
          h.alj,
          h.medical_expert,
          h.vocational_expert,
          h.hearing_decision_status,
          h.medical_record_status,
          h.manner_of_appearance,
          h.post_hrg_deadline,
          h.task_assigned,
          h.five_day_notice,
          h.medical_record_link,
          h.mr_team_id,
          p.old_value
      )
      SELECT
        u.id::text                               AS id,
        COALESCE(u.claimant, '')                 AS claimant,
        COALESCE(u.ssn_last_4, '')               AS ssn_last_4,
        CASE
          WHEN NULLIF(TRIM(COALESCE(u.ssn_last_4, '')), '') IS NULL THEN ''
          ELSE regexp_replace(lower(trim(COALESCE(u.claimant, ''))), '[[:space:]]+', ' ', 'g')
            || '|' || trim(COALESCE(u.ssn_last_4, ''))
        END                                      AS claimant_key,
        COALESCE(u.claim_type, '')               AS claim_type,
        COALESCE(u.hearing_date::text, '')       AS hearing_date,
        COALESCE(u.hearing_time::text, '')       AS hearing_time,
        COALESCE(u.time_zone, '')                AS time_zone,
        COALESCE(u.converted_time_est::text, '') AS converted_time_est,
        COALESCE(u.alj, '')                      AS alj,
        COALESCE(u.medical_expert, '')           AS medical_expert,
        COALESCE(u.vocational_expert, '')        AS vocational_expert,
        COALESCE(u.hearing_decision_status, '')  AS hearing_decision_status,
        COALESCE(u.medical_record_status, '')    AS medical_record_status,
        COALESCE(t.team_name, '')                AS mr_team_name,
        COALESCE(u.manner_of_appearance, '')     AS manner_of_appearance,
        COALESCE(u.post_hrg_deadline::text, '')  AS post_hrg_deadline,
        COALESCE(u.task_assigned, false)         AS task_assigned,
        COALESCE(u.five_day_notice, false)       AS five_day_notice,
        COALESCE(u.medical_record_link, '')      AS medical_record_link,
        u.old_value                              AS old_value
      FROM updated u
      LEFT JOIN mr_teams t ON u.mr_team_id = t.id
    `,
    [hearingId, ...updateParams],
  );

  const row = rows[0];
  if (!row) {
    throw new Error(`Failed to update hearing #${hearingId}`);
  }

  const { old_value, ...payload } = row;

  await recordHearingSyncEvent(client, {
    hearingId,
    eventType: "update",
    payload,
    changedFields: {
      [changedField]: {
        old: old_value ?? null,
        new: newValue,
      },
    },
  });

  return {
    payload,
    oldValue: old_value ?? null,
  };
}

async function updateMrTeamAndRecordEvent(
  client: SyncEventQueryRunner,
  hearingId: number,
  teamId: number | null,
): Promise<{ payload: HearingSyncPayloadRow; oldTeamName: string | null }> {
  type Row = HearingSyncPayloadRow & { old_team_name: string | null };

  const { rows } = await client.query<Row>(
    `
      WITH previous AS (
        SELECT
          h.id,
          t.team_name AS old_team_name
        FROM hearings h
        LEFT JOIN mr_teams t ON h.mr_team_id = t.id
        WHERE h.id = $1
        FOR UPDATE
      ),
      updated AS (
        UPDATE hearings h
        SET
          mr_team_id = $2,
          mr_team_assigned_at = CASE WHEN $2::int IS NULL THEN NULL ELSE NOW() END,
          updated_at = NOW()
        FROM previous p
        WHERE h.id = p.id
        RETURNING
          h.id,
          h.claimant,
          h.ssn_last_4,
          h.claim_type,
          h.hearing_date,
          h.hearing_time,
          h.time_zone,
          h.converted_time_est,
          h.alj,
          h.medical_expert,
          h.vocational_expert,
          h.hearing_decision_status,
          h.medical_record_status,
          h.manner_of_appearance,
          h.post_hrg_deadline,
          h.task_assigned,
          h.five_day_notice,
          h.medical_record_link,
          h.mr_team_id,
          p.old_team_name
      )
      SELECT
        u.id::text                               AS id,
        COALESCE(u.claimant, '')                 AS claimant,
        COALESCE(u.ssn_last_4, '')               AS ssn_last_4,
        CASE
          WHEN NULLIF(TRIM(COALESCE(u.ssn_last_4, '')), '') IS NULL THEN ''
          ELSE regexp_replace(lower(trim(COALESCE(u.claimant, ''))), '[[:space:]]+', ' ', 'g')
            || '|' || trim(COALESCE(u.ssn_last_4, ''))
        END                                      AS claimant_key,
        COALESCE(u.claim_type, '')               AS claim_type,
        COALESCE(u.hearing_date::text, '')       AS hearing_date,
        COALESCE(u.hearing_time::text, '')       AS hearing_time,
        COALESCE(u.time_zone, '')                AS time_zone,
        COALESCE(u.converted_time_est::text, '') AS converted_time_est,
        COALESCE(u.alj, '')                      AS alj,
        COALESCE(u.medical_expert, '')           AS medical_expert,
        COALESCE(u.vocational_expert, '')        AS vocational_expert,
        COALESCE(u.hearing_decision_status, '')  AS hearing_decision_status,
        COALESCE(u.medical_record_status, '')    AS medical_record_status,
        COALESCE(t.team_name, '')                AS mr_team_name,
        COALESCE(u.manner_of_appearance, '')     AS manner_of_appearance,
        COALESCE(u.post_hrg_deadline::text, '')  AS post_hrg_deadline,
        COALESCE(u.task_assigned, false)         AS task_assigned,
        COALESCE(u.five_day_notice, false)       AS five_day_notice,
        COALESCE(u.medical_record_link, '')      AS medical_record_link,
        u.old_team_name                          AS old_team_name
      FROM updated u
      LEFT JOIN mr_teams t ON u.mr_team_id = t.id
    `,
    [hearingId, teamId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error(`Failed to update MR team for hearing #${hearingId}`);
  }

  const { old_team_name, ...payload } = row;
  const newTeamName = payload.mr_team_name || null;

  await recordHearingSyncEvent(client, {
    hearingId,
    eventType: "update",
    payload,
    changedFields: {
      mr_team_name: {
        old: old_team_name ?? null,
        new: newTeamName,
      },
    },
  });

  return {
    payload,
    oldTeamName: old_team_name ?? null,
  };
}

// ─── Shared SQL fragment — excludes withdrawn/dismissed records ───────────────
const WITHDRAWN_FILTER = `
  (h.medical_record_status != 'WITHDRAWAL' OR h.medical_record_status IS NULL)
  AND (
    h.hearing_decision_status IS NULL
    OR (
      h.hearing_decision_status NOT LIKE 'Withdrawal%'
      AND h.hearing_decision_status != 'WD CLMT DECEASED'
      AND h.hearing_decision_status != 'Dismissal'
    )
  )
`.trim();

// ─── Page data loader — all independent queries run in parallel ───────────────

export async function getMrPivotPageData(
  userRole: UserRole = "mr_agent",
  userId?: number,
): Promise<MrPivotPageData> {
  const overrides = userId
    ? await getUserFieldOverridesPlain(userId, "medical_records")
    : {};
  const permissions = derivePermissionsWithOverrides(userRole, overrides);

  const [
    statsRow,
    withdrawnRow,
    postHrgRow,
    noSpecialistRow,
    noTaskRow,
    nextUnassignedHearingRow,
    nextUnassignedTaskRow,
    teamGrandTotalsRows,
    mrStatusPivotRows,
    groupedAssignedRows,
    weeklyStatsRows,
    monthlyStatsRows,
    availableMonthsRows,
    availableYearsRows,
    medicalTeamsRows,
    mrStatusOptions,
    decisionStatusOptions,
    mannerOptions,
    jeromeTeamRow,
    rotationTeamsRows,
    lastAssignedRow,
  ] = await Promise.all([
    // ── Stat cards ────────────────────────────────────────────────────────────
    db.query(`
      SELECT
        COUNT(*)                                                                         AS total,
        SUM(CASE WHEN medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete_count,
        SUM(CASE WHEN medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS progress_count,
        SUM(CASE WHEN medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready_count,
        SUM(CASE WHEN medical_record_status IS NULL
                   OR medical_record_status = ''
                   OR medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started_count,
        SUM(CASE WHEN medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent_count
      FROM hearings h
      WHERE ${WITHDRAWN_FILTER}
    `),

    // ── Withdrawn / dismissed count ───────────────────────────────────────────
    db.query(`
      SELECT COUNT(*) AS cnt
      FROM hearings
      WHERE medical_record_status = 'WITHDRAWAL'
        OR hearing_decision_status LIKE 'Withdrawal%'
        OR hearing_decision_status = 'WD CLMT DECEASED'
        OR hearing_decision_status = 'Dismissal'
    `),

    // ── Post HRG Review count ─────────────────────────────────────────────────
    db.query(`
      SELECT COUNT(*) AS cnt
      FROM hearings
      WHERE (
        hearing_decision_status = 'Post HRG Review/ Dev'
        OR medical_record_status = 'Post Hearing Development'
      )
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
        AND (hearing_decision_status NOT LIKE 'Withdrawal%' OR hearing_decision_status = 'Post HRG Review/ Dev')
    `),

    // ── No specialist count (upcoming, not withdrawn) ─────────────────────────
    db.query(`
      SELECT COUNT(*) AS cnt
      FROM hearings
      WHERE mr_team_id IS NULL
        AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
    `),

    // ── No task assigned count (upcoming, not withdrawn) ─────────────────────
    db.query(`
      SELECT COUNT(*) AS cnt
      FROM hearings
      WHERE (task_assigned IS NULL OR task_assigned = false)
        AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
    `),

    // ── Next upcoming unassigned hearing ─────────────────────────────────────
    db.query<HearingListPreview>(`
      SELECT id, claimant, hearing_date::text
      FROM hearings
      WHERE mr_team_id IS NULL
        AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
      ORDER BY hearing_date ASC
      LIMIT 1
    `),

    // ── Next hearing without task assigned ────────────────────────────────────
    db.query<HearingListPreview>(`
      SELECT id, claimant, hearing_date::text
      FROM hearings
      WHERE (task_assigned IS NULL OR task_assigned = false)
        AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
      ORDER BY hearing_date ASC
      LIMIT 1
    `),

    // ── Team grand totals (sidebar) ───────────────────────────────────────────
    db.query(`
      SELECT
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999)      AS display_order,
        COUNT(*)                             AS total
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER}
      GROUP BY t.team_name, t.team_color, t.display_order
      ORDER BY COALESCE(t.display_order, 9999) ASC
    `),

    // ── MR status pivot (status breakdown by team) ────────────────────────────
    db.query(`
      SELECT
        COALESCE(t.team_name, 'Unassigned') AS team,
        t.team_color,
        COALESCE(t.display_order, 9999)      AS display_order,
        h.medical_record_status,
        COUNT(*)                             AS cnt
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER}
      GROUP BY t.team_name, t.team_color, t.display_order, h.medical_record_status
      ORDER BY COALESCE(t.display_order, 9999) ASC
    `),

    // ── Assigned cases by month / team ────────────────────────────────────────
    db.query(`
      SELECT
        TO_CHAR(h.hearing_date, 'YYYY-MM') AS month_key,
        TO_CHAR(h.hearing_date, 'Mon YYYY') AS month_label,
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999) AS display_order,
        COUNT(*) AS case_count
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER}
      GROUP BY TO_CHAR(h.hearing_date, 'YYYY-MM'), TO_CHAR(h.hearing_date, 'Mon YYYY'),
               t.team_name, t.team_color, t.display_order
      ORDER BY month_key ASC, COALESCE(t.display_order, 9999) ASC
    `),

    // ── Weekly team stats ─────────────────────────────────────────────────────
    db.query(`
      SELECT
        TO_CHAR(h.hearing_date, 'IYYY-IW') AS week_key,
        TO_CHAR(date_trunc('week', h.hearing_date), 'Mon DD') AS week_start,
        TO_CHAR(date_trunc('week', h.hearing_date) + INTERVAL '6 days', 'Mon DD, YYYY') AS week_end,
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999) AS display_order,
        COUNT(*) AS total_cases,
        SUM(CASE WHEN h.medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete,
        SUM(CASE WHEN h.medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN h.medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN h.medical_record_status IS NULL
                   OR h.medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started,
        SUM(CASE WHEN h.medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER}
      GROUP BY TO_CHAR(h.hearing_date, 'IYYY-IW'),
               TO_CHAR(date_trunc('week', h.hearing_date), 'Mon DD'),
               TO_CHAR(date_trunc('week', h.hearing_date) + INTERVAL '6 days', 'Mon DD, YYYY'),
               t.team_name, t.team_color, t.display_order
      ORDER BY week_key DESC, COALESCE(t.display_order, 9999) ASC
    `),

    // ── Monthly team stats ────────────────────────────────────────────────────
    db.query(`
      SELECT
        TO_CHAR(h.hearing_date, 'YYYY-MM') AS month_key,
        TO_CHAR(h.hearing_date, 'Mon YYYY') AS month_label,
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999) AS display_order,
        COUNT(*) AS total_cases,
        SUM(CASE WHEN h.medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete,
        SUM(CASE WHEN h.medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN h.medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN h.medical_record_status IS NULL
                   OR h.medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started,
        SUM(CASE WHEN h.medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER}
      GROUP BY TO_CHAR(h.hearing_date, 'YYYY-MM'), TO_CHAR(h.hearing_date, 'Mon YYYY'),
               t.team_name, t.team_color, t.display_order
      ORDER BY month_key DESC, COALESCE(t.display_order, 9999) ASC
    `),

    // ── Available months filter ───────────────────────────────────────────────
    db.query(`
      SELECT DISTINCT
        TO_CHAR(hearing_date, 'YYYY-MM') AS month_value,
        TO_CHAR(hearing_date, 'Month YYYY') AS month_label
      FROM hearings
      ORDER BY month_value DESC
    `),

    // ── Available years (for assignment card filters) ─────────────────────────
    db.query(`
      SELECT DISTINCT EXTRACT(YEAR FROM hearing_date)::int AS year
      FROM hearings
      WHERE hearing_date >= CURRENT_DATE
      ORDER BY year ASC
    `),

    // ── Active, assignable MR teams ───────────────────────────────────────────
    db.query(`
      SELECT id, team_name, team_color, team_type, is_active, is_assignable, display_order
      FROM mr_teams
      WHERE is_active = true
      ORDER BY display_order ASC
    `),

    // ── Medical record status options from config ─────────────────────────────
    db.query(`
      SELECT option_value
      FROM config_options
      WHERE option_type = 'medical_record_status' AND is_active = true
      ORDER BY display_order ASC
    `),

    // ── Hearing decision status options from config ───────────────────────────
    db.query(`
      SELECT option_value
      FROM config_options
      WHERE option_type = 'hearing_decision_status' AND is_active = true
      ORDER BY display_order ASC
    `),

    // ── Manner of appearance options from config ──────────────────────────────
    db.query(`
      SELECT option_value
      FROM config_options
      WHERE option_type = 'manner_of_appearance' AND is_active = true
      ORDER BY display_order ASC
    `),

    // ── Jerome's team info ────────────────────────────────────────────────────
    db.query(`
      SELECT id, team_name, team_color
      FROM mr_teams
      WHERE team_name ILIKE '%jerome%' AND is_active = true
      LIMIT 1
    `),

    // ── Round-robin: rotation teams ───────────────────────────────────────────
    db.query(`
      SELECT id, team_name, team_color
      FROM mr_teams
      WHERE is_active = true
        AND is_assignable = true
        AND team_color IS NOT NULL
        AND team_color != ''
      ORDER BY display_order ASC
    `),

    // ── Round-robin: last assigned team ──────────────────────────────────────
    db.query(`
      SELECT t.id, t.team_name, t.team_color
      FROM hearings h
      JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE t.is_active = true
        AND t.is_assignable = true
        AND t.team_color IS NOT NULL AND t.team_color != ''
        AND h.mr_team_assigned_at IS NOT NULL
        AND (h.medical_record_status != 'WITHDRAWAL' OR h.medical_record_status IS NULL)
      ORDER BY h.mr_team_assigned_at DESC
      LIMIT 1
    `),
  ]);

  // ── Shape: stat cards ───────────────────────────────────────────────────────
  const s = statsRow.rows[0] ?? {};
  const statCards: MrPivotStatCards = {
    totalHearings: Number(s.total           ?? 0),
    complete: Number(s.complete_count   ?? 0),
    inProgress: Number(s.progress_count   ?? 0),
    ready: Number(s.ready_count      ?? 0),
    notStarted: Number(s.not_started_count ?? 0),
    urgent: Number(s.urgent_count      ?? 0),
    noSpecialistCount: Number(noSpecialistRow.rows[0]?.cnt ?? 0),
    noTaskCount: Number(noTaskRow.rows[0]?.cnt ?? 0),
    nextUnassignedHearing: nextUnassignedHearingRow.rows[0] ?? null,
    nextUnassignedTask: nextUnassignedTaskRow.rows[0] ?? null,
  };

  // ── Shape: team grand totals ────────────────────────────────────────────────
  const teamGrandTotals = teamGrandTotalsRows.rows.map((r: Record<string, unknown>) => ({
    team_name:  r.team_name as string,
    team_color: r.team_color as string | null,
    total:      Number(r.total),
  }));

  // ── Shape: MR status by team (pivot) ───────────────────────────────────────
  const mrStatusMap: Record<string, { color: string | null; display_order: number; statuses: Record<string, number> }> = {};
  for (const r of mrStatusPivotRows.rows as Record<string, unknown>[]) {
    const team = r.team as string;
    if (!mrStatusMap[team]) {
      mrStatusMap[team] = { color: r.team_color as string | null, display_order: Number(r.display_order ?? 999), statuses: {} };
    }
    const statusKey = (r.medical_record_status as string | null) ?? "No Status";
    mrStatusMap[team].statuses[statusKey] = Number(r.cnt);
  }
  const mrStatusByTeam = Object.entries(mrStatusMap)
    .sort(([, a], [, b]) => a.display_order - b.display_order)
    .map(([team, data]) => ({ team, ...data }));

  // ── Shape: grouped assigned by month ───────────────────────────────────────
  const assignedMap: Record<string, { month_label: string; teams: { team_name: string; team_color: string | null; case_count: number }[]; total: number }> = {};
  for (const r of groupedAssignedRows.rows as Record<string, unknown>[]) {
    const key = r.month_key as string;
    if (!assignedMap[key]) {
      assignedMap[key] = { month_label: r.month_label as string, teams: [], total: 0 };
    }
    assignedMap[key].teams.push({
      team_name:  r.team_name as string,
      team_color: r.team_color as string | null,
      case_count: Number(r.case_count),
    });
    assignedMap[key].total += Number(r.case_count);
  }
  const groupedAssigned = Object.entries(assignedMap).map(([month_key, v]) => ({ month_key, month_label: v.month_label, teams: v.teams, total: v.total }));

  // ── Shape: weekly stats ─────────────────────────────────────────────────────
  const weeklyMap: Record<string, { label: string; teams: MonthlyTeamStat["teams"]; totals: MonthlyTeamStat["totals"] }> = {};
  for (const r of weeklyStatsRows.rows as Record<string, unknown>[]) {
    const key = r.week_key as string;
    if (!weeklyMap[key]) {
      weeklyMap[key] = { label: `${r.week_start} - ${r.week_end}`, teams: [], totals: { total: 0, complete: 0, in_progress: 0, ready: 0, not_started: 0, urgent: 0 } };
    }
    const tc = Number(r.total_cases);
    const co = Number(r.complete);
    const ip = Number(r.in_progress);
    const re = Number(r.ready);
    const ns = Number(r.not_started);
    const ug = Number(r.urgent);
    weeklyMap[key].teams.push({ team_name: r.team_name as string, team_color: r.team_color as string | null, total_cases: tc, complete: co, in_progress: ip, ready: re, not_started: ns, urgent: ug });
    weeklyMap[key].totals.total      += tc;
    weeklyMap[key].totals.complete   += co;
    weeklyMap[key].totals.in_progress += ip;
    weeklyMap[key].totals.ready      += re;
    weeklyMap[key].totals.not_started += ns;
    weeklyMap[key].totals.urgent     += ug;
  }
  // const weekly = Object.values(weeklyMap);

  // ── Shape: monthly stats ────────────────────────────────────────────────────
  const monthlyMap: Record<string, { label: string; teams: MonthlyTeamStat["teams"]; totals: MonthlyTeamStat["totals"] }> = {};
  for (const r of monthlyStatsRows.rows as Record<string, unknown>[]) {
    const key = r.month_key as string;
    if (!monthlyMap[key]) {
      monthlyMap[key] = { label: r.month_label as string, teams: [], totals: { total: 0, complete: 0, in_progress: 0, ready: 0, not_started: 0, urgent: 0 } };
    }
    const tc = Number(r.total_cases);
    const co = Number(r.complete);
    const ip = Number(r.in_progress);
    const re = Number(r.ready);
    const ns = Number(r.not_started);
    const ug = Number(r.urgent);
    monthlyMap[key].teams.push({ team_name: r.team_name as string, team_color: r.team_color as string | null, total_cases: tc, complete: co, in_progress: ip, ready: re, not_started: ns, urgent: ug });
    monthlyMap[key].totals.total      += tc;
    monthlyMap[key].totals.complete   += co;
    monthlyMap[key].totals.in_progress += ip;
    monthlyMap[key].totals.ready      += re;
    monthlyMap[key].totals.not_started += ns;
    monthlyMap[key].totals.urgent     += ug;
  }
  // const monthly = Object.values(monthlyMap);

  // ── Shape: round-robin state ────────────────────────────────────────────────
  // Derive rotation order dynamically from DB — no hardcoded team list
  const colorToTeam: Record<string, { id: number; name: string; color: string }> = {};
  for (const rt of rotationTeamsRows.rows as Record<string, unknown>[]) {
    colorToTeam[rt.team_color as string] = { id: Number(rt.id), name: rt.team_name as string, color: rt.team_color as string };
  }
  const ROTATION_ORDER = (rotationTeamsRows.rows as Record<string, unknown>[]).map(r => r.team_color as string);

  // Fallback: if mr_team_assigned_at was null on all rows, try last assigned by id
  let lastRow = lastAssignedRow.rows[0] as Record<string, unknown> | undefined;
  if (!lastRow) {
    const fallback = await db.query(`
      SELECT t.id, t.team_name, t.team_color
      FROM hearings h
      JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE t.is_active = true AND t.is_assignable = true
        AND t.team_color IS NOT NULL AND t.team_color != ''
      ORDER BY h.id DESC
      LIMIT 1
    `);
    lastRow = fallback.rows[0];
  }

  const lastColor = (lastRow?.team_color as string | undefined) ?? ROTATION_ORDER[ROTATION_ORDER.length - 1] ?? "blue";
  const lastTeamName = (lastRow?.team_name  as string | undefined) ?? "None";
  const lastIndex = ROTATION_ORDER.indexOf(lastColor);
  const nextIndex = (lastIndex + 1) % ROTATION_ORDER.length;
  const nextColor = ROTATION_ORDER[nextIndex];
  const nextTeamObj = colorToTeam[nextColor];
  const nextTeamName = nextTeamObj?.name ?? "Blue Team";

  const [nextUnassignedRRRow, urgentUnassignedRow] = await Promise.all([
    db.query<HearingListPreview>(`
      SELECT id, claimant, hearing_date::text
      FROM hearings
      WHERE mr_team_id IS NULL
        AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
      ORDER BY hearing_date ASC
      LIMIT 1
    `),
    db.query(`
      SELECT COUNT(*) AS cnt
      FROM hearings
      WHERE mr_team_id IS NULL
        AND hearing_date >= CURRENT_DATE
        AND hearing_date <= CURRENT_DATE + INTERVAL '28 days'
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
    `),
  ]);

  const roundRobin: RoundRobinState = {
    lastColor,
    lastTeamName,
    nextColor,
    nextTeamName,
    rotationOrder: ROTATION_ORDER,
    nextUnassignedHearing: nextUnassignedRRRow.rows[0] ?? null,
    urgentUnassignedCount: Number(urgentUnassignedRow.rows[0]?.cnt ?? 0),
  };

  // ── Shape: config options (with fallbacks matching PHP defaults) ────────────
  const medicalTeams = medicalTeamsRows.rows as MrTeam[];

  const mrStatusOptionsList: string[] = mrStatusOptions.rows.length
    ? mrStatusOptions.rows.map((r: Record<string, unknown>) => r.option_value as string)
    : ["Complete", "Incomplete", "In Progress", "Overpayment", "Not Started", "Ready", "URGENT! NEEDS ATTENTION", "c/o Franciso's Team", "WITHDRAWAL", "CLIENT UNREACHABLE"];

  const decisionStatusList: string[] = decisionStatusOptions.rows.length
    ? decisionStatusOptions.rows.map((r: Record<string, unknown>) => r.option_value as string)
    : ["Scheduled", "Post HRG Review/ Dev", "Favorable", "Unfavorable", "Pending Decision", "Continued", "OTR AT HRG", "GOOD CAUSE LTR TO CLMT", "WD CLMT DECEASED", "Dismissal", "Withdrawal - No Contact", "Withdrawal - SGA", "Withdrawal - Client Terminated Rep", "Withdrawal - In-Person", "Withdrawal - Client Working/ Doing Better/WD Hrg Req", "Withdrawal - UFD", "Withdrawal - Receiving Benefits", "Withdrawal - Misc"];

  const mannerOptionsList: string[] = mannerOptions.rows.length
    ? mannerOptions.rows.map((r: Record<string, unknown>) => r.option_value as string)
    : ["Get Phone Permission", "Case is Ready", "In Person Florida", "Phone", "OVH"];

  const jerome = jeromeTeamRow.rows[0] as { id: number; team_name: string; team_color: string } | undefined;

  return {
    statCards,
    teamGrandTotals,
    mrStatusByTeam,
    groupedAssigned,
    roundRobin,
    availableMonths: availableMonthsRows.rows.map((r: Record<string, unknown>) => ({
      month_value: r.month_value as string,
      month_label: (r.month_label as string).trim(),
    })),
    availableYears: availableYearsRows.rows.map((r: Record<string, unknown>) => Number(r.year)),
    medical_teams: medicalTeams,
    medical_record_status_options: mrStatusOptionsList,
    hearing_decision_status_options: decisionStatusList,
    manner_options: mannerOptionsList,
    jeromeTeamInfo: jerome ?? null,
    permissions,
    withdrawnCount: Number(withdrawnRow.rows[0]?.cnt ?? 0),
    postHrgCount:   Number(postHrgRow.rows[0]?.cnt ?? 0),
  };
}

// ─── Paginated hearings query ─────────────────────────────────────────────────

export async function getHearingsPaginated(
  filters: HearingFilters,
): Promise<PaginatedHearingsResult> {
  const params: unknown[] = [];
  const where: string[] = [WITHDRAWN_FILTER];

  // Search
  if (filters.search?.trim()) {
    const idx = params.length + 1;
    params.push(`%${filters.search.trim()}%`);
    where.push(`(h.claimant ILIKE $${idx} OR r.name ILIKE $${idx})`);
  }

  // Date range (takes priority over month_filter)
  if (filters.date_range && filters.date_range !== "custom") {
    const ranges: Record<string, string> = {
      today: `h.hearing_date = CURRENT_DATE`,
      this_week: `h.hearing_date BETWEEN date_trunc('week', CURRENT_DATE) AND date_trunc('week', CURRENT_DATE) + INTERVAL '6 days'`,
      this_month: `h.hearing_date BETWEEN date_trunc('month', CURRENT_DATE) AND (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')`,
      next_week: `h.hearing_date BETWEEN date_trunc('week', CURRENT_DATE) + INTERVAL '7 days' AND date_trunc('week', CURRENT_DATE) + INTERVAL '13 days'`,
      next_month: `h.hearing_date BETWEEN date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' AND date_trunc('month', CURRENT_DATE) + INTERVAL '2 months' - INTERVAL '1 day'`,
    };
    if (ranges[filters.date_range]) where.push(ranges[filters.date_range]);
  } else if (filters.date_range === "custom") {
    if (filters.date_from && filters.date_to) {
      params.push(filters.date_from); where.push(`h.hearing_date >= $${params.length}`);
      params.push(filters.date_to);   where.push(`h.hearing_date <= $${params.length}`);
    } else if (filters.date_from) {
      params.push(filters.date_from); where.push(`h.hearing_date >= $${params.length}`);
    } else if (filters.date_to) {
      params.push(filters.date_to); where.push(`h.hearing_date <= $${params.length}`);
    }
  } else if (filters.month_filter) {
    params.push(filters.month_filter);
    where.push(`TO_CHAR(h.hearing_date, 'YYYY-MM') = $${params.length}`);
  }

  // Team filter
  if (filters.team_filter) {
    if (filters.team_filter === "unassigned") {
      where.push("h.mr_team_id IS NULL");
    } else {
      params.push(filters.team_filter);
      where.push(`h.mr_team_id = $${params.length}`);
    }
  }

  // Status filter
  if (filters.status_filter) {
    if (filters.status_filter === "unassigned") {
      where.push("(h.medical_record_status IS NULL OR h.medical_record_status = '')");
    } else {
      params.push(filters.status_filter);
      where.push(`h.medical_record_status = $${params.length}`);
    }
  }

  // Assignment filter
  if (filters.assignment_filter === "no_specialist") {
    where.push("h.mr_team_id IS NULL");
  } else if (filters.assignment_filter === "no_task") {
    where.push("(h.task_assigned IS NULL OR h.task_assigned = false)");
  } else if (filters.assignment_filter === "no_both") {
    where.push("h.mr_team_id IS NULL");
    where.push("(h.task_assigned IS NULL OR h.task_assigned = false)");
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;
  const sortDir = filters.sort_order === "desc" ? "DESC" : "ASC";

  // Count + stats in one pass
  const statsResult = await db.query(
    `SELECT
       COUNT(*)                                                                         AS total,
       SUM(CASE WHEN h.medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete,
       SUM(CASE WHEN h.medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
       SUM(CASE WHEN h.medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready,
       SUM(CASE WHEN h.medical_record_status IS NULL
                  OR h.medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started,
       SUM(CASE WHEN h.medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent
     FROM hearings h
     LEFT JOIN representatives r ON h.assigned_rep_id = r.id
     ${whereClause}`,
    params,
  );

  const totalCount = Number(statsResult.rows[0]?.total ?? 0);
  const page = Math.max(1, filters.page ?? 1);
  const perPage = filters.per_page === "all"
    ? Math.max(1, Math.min(totalCount, 500))
    : Math.max(1, Math.min(500, Number(filters.per_page ?? 50)));
  const offset = (page - 1) * perPage;

  params.push(perPage); const limitIdx  = params.length;
  params.push(offset); const offsetIdx = params.length;

  const hearingsResult = await db.query(
    `SELECT
       h.*,
       r.name AS rep_name,
       t.team_name AS mr_team_name,
       t.team_color AS mr_team_color,
       t.team_type AS mr_team_type,
       t.id AS mr_team_id,
       h.hearing_date::text AS hearing_date
     FROM hearings h
     LEFT JOIN representatives r ON h.assigned_rep_id = r.id
     LEFT JOIN mr_teams t ON h.mr_team_id = t.id
     ${whereClause}
     ORDER BY h.hearing_date ${sortDir}, COALESCE(t.display_order, 9999) ASC, h.converted_time_est ${sortDir}
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  const sr = statsResult.rows[0] ?? {};
  return {
    hearings: hearingsResult.rows as Hearing[],
    total: totalCount,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(totalCount / perPage)),
    stats: {
      total: totalCount,
      complete: Number(sr.complete    ?? 0),
      in_progress: Number(sr.in_progress ?? 0),
      ready: Number(sr.ready       ?? 0),
      not_started: Number(sr.not_started ?? 0),
      urgent: Number(sr.urgent      ?? 0),
    },
  };
}

// ─── Mutation actions ─────────────────────────────────────────────────────────

export async function updateMrStatus(
  hearingId: number,
  status: string,
): Promise<{ success: boolean }> {
<<<<<<< HEAD
  await db.transaction(async (client) => {
    await updateSingleFieldAndRecordEvent<string>({
      client,
      hearingId,
      oldValueColumnSql: "medical_record_status",
      updateSetSql: "medical_record_status = $2",
      updateParams: [status],
      changedField: "medical_record_status",
      newValue: status || null,
    });
  });

=======
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess("medical_records", "medical_record_status");
  await db.query(
    `UPDATE hearings SET medical_record_status = $1 WHERE id = $2`,
    [status, hearingId],
  );
>>>>>>> 6759f89ffa0255ffc40f1b21909783d6b4bb0f59
  await logActivity("mr_status_updated", `MR status updated to "${status}" for hearing #${hearingId}`);
  return { success: true };
}

export async function updateHearingDecisionStatus(
  hearingId: number,
  status: string,
): Promise<{ success: boolean }> {
<<<<<<< HEAD
  const txResult = await db.transaction<{ claimant: string }>(async (client) => {
    const { payload } = await updateSingleFieldAndRecordEvent<string>({
      client,
      hearingId,
      oldValueColumnSql: "hearing_decision_status",
      updateSetSql: "hearing_decision_status = $2",
      updateParams: [status],
      changedField: "hearing_decision_status",
      newValue: status || null,
    });

    return {
      claimant: payload.claimant || `Hearing #${hearingId}`,
    };
  });

=======
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess("medical_records", "hearing_decision_status");
  await db.query(
    `UPDATE hearings SET hearing_decision_status = $1 WHERE id = $2`,
    [status, hearingId],
  );
>>>>>>> 6759f89ffa0255ffc40f1b21909783d6b4bb0f59
  await logActivity("decision_status_updated", `Decision status updated to "${status}" for hearing #${hearingId}`);

  const isWithdrawal = status.startsWith("Withdrawal") || status === "WD CLMT DECEASED" || status === "Dismissal";
  const isPostHrg = status === "Post HRG Review/ Dev";

  if (isWithdrawal) await createWithdrawalNotification(hearingId, txResult.claimant);
  if (isPostHrg) await createPostHrgNotification(hearingId, txResult.claimant);

  return { success: true };
}

export async function updateMrTeam(
  hearingId: number,
  teamId: number | null,
): Promise<{ success: boolean }> {
<<<<<<< HEAD
  const txResult = await db.transaction<{ newTeamName: string | null }>(async (client) => {
    const { payload } = await updateMrTeamAndRecordEvent(client, hearingId, teamId);

    return {
      newTeamName: payload.mr_team_name || null,
    };
  });

  await logActivity(
    "mr_team_assigned",
    txResult.newTeamName
      ? `MR team "${txResult.newTeamName}" assigned to hearing #${hearingId}`
      : `MR team unassigned from hearing #${hearingId}`,
=======
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess("medical_records", "mr_team_id");
  await db.query(
    `UPDATE hearings SET mr_team_id = $1, mr_team_assigned_at = $2 WHERE id = $3`,
    [teamId, teamId ? new Date().toISOString() : null, hearingId],
>>>>>>> 6759f89ffa0255ffc40f1b21909783d6b4bb0f59
  );
  return { success: true };
}

export async function toggleTaskAssigned(
  hearingId: number,
  value: boolean,
): Promise<{ success: boolean }> {
<<<<<<< HEAD
  await db.transaction(async (client) => {
    await updateSingleFieldAndRecordEvent<boolean>({
      client,
      hearingId,
      oldValueColumnSql: "task_assigned",
      updateSetSql: "task_assigned = $2",
      updateParams: [value],
      changedField: "task_assigned",
      newValue: value,
    });
  });

  await logActivity("task_assigned_updated", `Task assigned set to ${value} for hearing #${hearingId}`);
=======
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess("medical_records", "task_assigned");
  await db.query(
    `UPDATE hearings SET task_assigned = $1 WHERE id = $2`,
    [value, hearingId],
  );
  await logActivity("five_day_notice_updated", `Task assigned set to ${value} for hearing #${hearingId}`);
>>>>>>> 6759f89ffa0255ffc40f1b21909783d6b4bb0f59
  return { success: true };
}

export async function toggleCredited(
  hearingId: number,
  value: boolean,
): Promise<{ success: boolean }> {
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess("medical_records", "credited");
  await db.query(
    `UPDATE hearings SET credited = $1, updated_at = NOW() WHERE id = $2`,
    [value, hearingId],
  );
  await logActivity("credited_updated", `Credited set to ${value} for hearing #${hearingId}`);
  return { success: true };
}

export async function toggleFiveDayNotice(
  hearingId: number,
  value: boolean,
): Promise<{ success: boolean }> {
<<<<<<< HEAD
  await db.transaction(async (client) => {
    await updateSingleFieldAndRecordEvent<boolean>({
      client,
      hearingId,
      oldValueColumnSql: "five_day_notice",
      updateSetSql: "five_day_notice = $2",
      updateParams: [value],
      changedField: "five_day_notice",
      newValue: value,
    });
  });

=======
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess("medical_records", "five_day_notice");
  await db.query(
    `UPDATE hearings SET five_day_notice = $1 WHERE id = $2`,
    [value, hearingId],
  );
>>>>>>> 6759f89ffa0255ffc40f1b21909783d6b4bb0f59
  await logActivity("five_day_notice_updated", `5-Day Notice set to ${value} for hearing #${hearingId}`);
  return { success: true };
}

export async function updateMoa(
  hearingId: number,
  manner: string,
): Promise<{ success: boolean }> {
<<<<<<< HEAD
  await db.transaction(async (client) => {
    await updateSingleFieldAndRecordEvent<string>({
      client,
      hearingId,
      oldValueColumnSql: "manner_of_appearance",
      updateSetSql: "manner_of_appearance = $2",
      updateParams: [manner],
      changedField: "manner_of_appearance",
      newValue: manner || null,
    });
  });

=======
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess("medical_records", "manner_of_appearance");
  await db.query(
    `UPDATE hearings SET manner_of_appearance = $1 WHERE id = $2`,
    [manner, hearingId],
  );
>>>>>>> 6759f89ffa0255ffc40f1b21909783d6b4bb0f59
  await logActivity("moa_updated", `MOA updated to "${manner}" for hearing #${hearingId}`);
  return { success: true };
}

export async function updateWorksheetLink(
  hearingId: number,
  link: string,
): Promise<{ success: boolean }> {
<<<<<<< HEAD
  await db.transaction(async (client) => {
    await updateSingleFieldAndRecordEvent<string>({
      client,
      hearingId,
      oldValueColumnSql: "medical_record_link",
      updateSetSql: "medical_record_link = $2",
      updateParams: [link],
      changedField: "medical_record_link",
      newValue: link || null,
    });
  });

=======
  const { requireFieldAccess } = await import("@/lib/field-access");
  await requireFieldAccess("medical_records", "medical_record_link");
  await db.query(
    `UPDATE hearings SET medical_record_link = $1 WHERE id = $2`,
    [link, hearingId],
  );
>>>>>>> 6759f89ffa0255ffc40f1b21909783d6b4bb0f59
  await logActivity("mr_link_updated", `Worksheet link updated for hearing #${hearingId}`);
  return { success: true };
}

export async function bulkUpdateMrStatus(
  hearingIds: number[],
  status: string,
): Promise<{ success: boolean; message: string }> {
  if (!hearingIds.length) return { success: false, message: "No hearings selected" };

  await db.transaction(async (client) => {
    const { rows } = await client.query<{ id: number; medical_record_status: string | null }>(
      `SELECT id, medical_record_status FROM hearings WHERE id = ANY($1::int[])`,
      [hearingIds],
    );

    await client.query(
      `UPDATE hearings SET medical_record_status = $1, updated_at = NOW() WHERE id = ANY($2::int[])`,
      [status, hearingIds],
    );

    for (const row of rows) {
      await recordHearingUpdateEvent(client, {
        hearingId: row.id,
        changedFields: {
          medical_record_status: {
            old: row.medical_record_status ?? null,
            new: status || null,
          },
        },
      });
    }
  });

  await logActivity("bulk_mr_status_updated", `Bulk updated ${hearingIds.length} hearing(s) to "${status}"`);
  return { success: true, message: `${hearingIds.length} hearing(s) updated to "${status}"` };
}

export async function assignJeromeUrgent(): Promise<{
  success: boolean;
  message: string;
  count: number;
}> {
  const txResult = await db.transaction<{
    success: boolean;
    message: string;
    count: number;
    teamName: string;
  }>(async (client) => {
    const jerome = await client.query<{ id: number; team_name: string }>(
      `SELECT id, team_name FROM mr_teams WHERE team_name ILIKE '%jerome%' AND is_active = true LIMIT 1`,
    );
    const jeromeId = jerome.rows[0]?.id;
    const teamName = jerome.rows[0]?.team_name || "Jerome's Team";
    if (!jeromeId) return { success: false, message: "Jerome's Team not found", count: 0, teamName };

    const result = await client.query<{ id: number }>(
      `
        UPDATE hearings
        SET mr_team_id = $1, mr_team_assigned_at = NOW(), updated_at = NOW()
        WHERE mr_team_id IS NULL
          AND hearing_date >= CURRENT_DATE
          AND hearing_date <= CURRENT_DATE + INTERVAL '28 days'
          AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
        RETURNING id
      `,
      [jeromeId],
    );

    for (const row of result.rows) {
      const payload = await fetchHearingSyncPayload(client, row.id);
      if (!payload) continue;

      await recordHearingSyncEvent(client, {
        hearingId: row.id,
        eventType: "update",
        payload,
        changedFields: {
          mr_team_name: {
            old: null,
            new: payload.mr_team_name || teamName,
          },
        },
      });
    }

    const count = result.rows.length;
    return { success: true, message: `${count} hearing(s) assigned to ${teamName}`, count, teamName };
  });

  if (txResult.success) {
    await logActivity("urgent_team_assigned", `${txResult.count} urgent hearing(s) assigned to ${txResult.teamName}`);
  }

  return { success: txResult.success, message: txResult.message, count: txResult.count };
}

export async function getRoundRobinState(): Promise<RoundRobinState> {
  const [rotationRows, lastAssignedRows, nextHearingRows, urgentRows] = await Promise.all([
    db.query(`
      SELECT id, team_name, team_color FROM mr_teams
      WHERE is_active = true AND is_assignable = true
        AND team_color IS NOT NULL
        AND team_color NOT IN ('', 'pink')
      ORDER BY display_order ASC
    `),
    db.query(`
      SELECT t.team_name, t.team_color FROM hearings h
      JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE t.is_active = true AND t.is_assignable = true
        AND t.team_color IS NOT NULL AND t.team_color != ''
        AND h.mr_team_assigned_at IS NOT NULL
        AND (h.medical_record_status != 'WITHDRAWAL' OR h.medical_record_status IS NULL)
      ORDER BY h.mr_team_assigned_at DESC LIMIT 1
    `),
    db.query<HearingListPreview>(`
      SELECT id, claimant, hearing_date::text FROM hearings
      WHERE mr_team_id IS NULL AND hearing_date >= CURRENT_DATE
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
      ORDER BY hearing_date ASC LIMIT 1
    `),
    db.query(`
      SELECT COUNT(*) AS cnt FROM hearings
      WHERE mr_team_id IS NULL
        AND hearing_date >= CURRENT_DATE
        AND hearing_date <= CURRENT_DATE + INTERVAL '28 days'
        AND (medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)
    `),
  ]);

  // Derive rotation order from DB result — ordered by display_order, no hardcoded list
  const ROTATION_ORDER = (rotationRows.rows as Record<string, unknown>[]).map(r => r.team_color as string);
  const colorToTeam: Record<string, string> = {};
  for (const r of rotationRows.rows as Record<string, unknown>[]) {
    colorToTeam[r.team_color as string] = r.team_name as string;
  }

  const lastRow = lastAssignedRows.rows[0] as Record<string, unknown> | undefined;
  // Fallback to first team in rotation if no last assigned found
  const lastColor = (lastRow?.team_color as string | undefined) ?? ROTATION_ORDER[ROTATION_ORDER.length - 1] ?? "blue";
  const lastTeamName = (lastRow?.team_name  as string | undefined) ?? "None";
  const lastIndex = ROTATION_ORDER.indexOf(lastColor);
  const nextColor = ROTATION_ORDER[(lastIndex + 1) % ROTATION_ORDER.length];

  return {
    lastColor,
    lastTeamName,
    nextColor,
    nextTeamName: colorToTeam[nextColor] ?? "Blue Team",
    rotationOrder: ROTATION_ORDER,
    nextUnassignedHearing: nextHearingRows.rows[0] ?? null,
    urgentUnassignedCount: Number(urgentRows.rows[0]?.cnt ?? 0),
  };
}

export async function getTeamStats(params?: {
  dateFrom?: string;
  dateTo?: string;
  teamId?: number | null;
}): Promise<TeamStatsData> {
  const extraWhere: string[] = [];
  const extraParams: unknown[] = [];

  if (params?.dateFrom) {
    extraParams.push(params.dateFrom);
    extraWhere.push(`h.hearing_date >= $${extraParams.length}`);
  }
  if (params?.dateTo) {
    extraParams.push(params.dateTo);
    extraWhere.push(`h.hearing_date <= $${extraParams.length}`);
  }
  if (params?.teamId) {
    extraParams.push(params.teamId);
    extraWhere.push(`h.mr_team_id = $${extraParams.length}`);
  }

  const extraClause = extraWhere.length ? `AND ${extraWhere.join(" AND ")}` : "";

  const [weeklyRows, monthlyRows] = await Promise.all([
    db.query(`
      SELECT
        TO_CHAR(h.hearing_date, 'IYYY-IW') AS week_key,
        TO_CHAR(date_trunc('week', h.hearing_date), 'Mon DD') AS week_start,
        TO_CHAR(date_trunc('week', h.hearing_date) + INTERVAL '6 days', 'Mon DD, YYYY') AS week_end,
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999) AS display_order,
        COUNT(*) AS total_cases,
        SUM(CASE WHEN h.medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete,
        SUM(CASE WHEN h.medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN h.medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN h.medical_record_status IS NULL OR h.medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started,
        SUM(CASE WHEN h.medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER} ${extraClause}
      GROUP BY TO_CHAR(h.hearing_date,'IYYY-IW'),
               TO_CHAR(date_trunc('week',h.hearing_date),'Mon DD'),
               TO_CHAR(date_trunc('week',h.hearing_date)+INTERVAL '6 days','Mon DD, YYYY'),
               t.team_name, t.team_color, t.display_order
      ORDER BY week_key DESC, COALESCE(t.display_order,9999) ASC
    `, extraParams),
    db.query(`
      SELECT
        TO_CHAR(h.hearing_date, 'YYYY-MM') AS month_key,
        TO_CHAR(h.hearing_date, 'Mon YYYY') AS month_label,
        COALESCE(t.team_name, 'Unassigned') AS team_name,
        t.team_color,
        COALESCE(t.display_order, 9999) AS display_order,
        COUNT(*) AS total_cases,
        SUM(CASE WHEN h.medical_record_status = 'Complete' THEN 1 ELSE 0 END) AS complete,
        SUM(CASE WHEN h.medical_record_status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN h.medical_record_status = 'Ready' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN h.medical_record_status IS NULL OR h.medical_record_status = 'Not Started' THEN 1 ELSE 0 END) AS not_started,
        SUM(CASE WHEN h.medical_record_status = 'URGENT! NEEDS ATTENTION' THEN 1 ELSE 0 END) AS urgent
      FROM hearings h
      LEFT JOIN mr_teams t ON h.mr_team_id = t.id
      WHERE ${WITHDRAWN_FILTER} ${extraClause}
      GROUP BY TO_CHAR(h.hearing_date,'YYYY-MM'), TO_CHAR(h.hearing_date,'Mon YYYY'),
               t.team_name, t.team_color, t.display_order
      ORDER BY month_key DESC, COALESCE(t.display_order,9999) ASC
    `, extraParams),
  ]);

  const buildMap = (rows: Record<string, unknown>[], getKey: (r: Record<string, unknown>) => string, getLabel: (r: Record<string, unknown>) => string) => {
    const map: Record<string, { label: string; teams: MonthlyTeamStat["teams"]; totals: MonthlyTeamStat["totals"] }> = {};
    for (const r of rows) {
      const key = getKey(r);
      if (!map[key]) map[key] = { label: getLabel(r), teams: [], totals: { total: 0, complete: 0, in_progress: 0, ready: 0, not_started: 0, urgent: 0 } };
      const tc = Number(r.total_cases), co = Number(r.complete), ip = Number(r.in_progress), re = Number(r.ready), ns = Number(r.not_started), ug = Number(r.urgent);
      map[key].teams.push({ team_name: r.team_name as string, team_color: r.team_color as string | null, total_cases: tc, complete: co, in_progress: ip, ready: re, not_started: ns, urgent: ug });
      map[key].totals.total += tc; map[key].totals.complete += co; map[key].totals.in_progress += ip;
      map[key].totals.ready += re; map[key].totals.not_started += ns; map[key].totals.urgent += ug;
    }
    return Object.values(map);
  };

  return {
    weekly: buildMap(weeklyRows.rows as Record<string, unknown>[], r => r.week_key  as string, r => `${r.week_start} - ${r.week_end}`),
    monthly: buildMap(monthlyRows.rows as Record<string, unknown>[], r => r.month_key as string, r => r.month_label as string),
  };
}

export async function getNotifications(): Promise<NotificationItem[]> {
  try {
    const result = await db.query(`
      SELECT n.*, u.full_name AS created_by_name
      FROM sync_notifications n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE n.expires_at > NOW()
      ORDER BY n.created_at DESC
      LIMIT 50
    `);
    return result.rows as NotificationItem[];
  } catch {
    // sync_notifications table not yet migrated — return empty
    return [];
  }
}

// Called by Hearings Dashboard when a withdrawal decision is saved.
// Writes a notification that the MR page bell polls every 30s.
export async function createWithdrawalNotification(
  hearingId: number,
  claimantName: string,
): Promise<void> {
  try {
    const session = await getSession();
    const createdBy = session?.user?.id ?? null;
    await db.query(
      `INSERT INTO sync_notifications
         (notification_type, hearing_id, claimant_name, message, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')`,
      [
        "withdrawal",
        hearingId,
        claimantName,
        `Withdrawal decision recorded for ${claimantName}`,
        createdBy,
      ],
    );
  } catch {
    // Never let notification creation break the mutation that called it
  }
}

// Called when hearing_decision_status is set to "Post HRG Review/ Dev"
export async function createPostHrgNotification(
  hearingId: number,
  claimantName: string,
): Promise<void> {
  try {
    const session = await getSession();
    const createdBy = session?.user?.id ?? null;
    await db.query(
      `INSERT INTO sync_notifications
         (notification_type, hearing_id, claimant_name, message, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')`,
      [
        "status_change",
        hearingId,
        claimantName,
        `Post HRG Review/Dev set for ${claimantName}`,
        createdBy,
      ],
    );
  } catch {
    // Never let notification creation break the mutation that called it
  }
}

export async function getActivityLog(params: {
  type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  excludeSystemAdmin?: boolean;
}): Promise<{ items: ActivityLogItem[]; total: number }> {
  const where: string[] = [
    `a.action IN (
      'mr_status_updated','mr_team_assigned','mr_link_updated',
      'decision_status_updated','moa_updated','five_day_notice_updated',
      'credited_updated','bulk_mr_team_assigned','bulk_mr_status_updated',
      'urgent_team_assigned',
      'task_assigned_updated',       -- Fix 1: was mislabeled as five_day_notice_updated
      'post_hrg_deadline_updated'    -- Fix 2: was not logged at all
    )`
  ];
  const qParams: unknown[] = [];

  // Exempt system_admin (user id=1) by default — matches dashboard activity log behaviour
  if (params.excludeSystemAdmin !== false) {
    where.push(`u.role != 'system_admin'`);
  }

  if (params.type) {
    qParams.push(params.type);
    where.push(`a.action = $${qParams.length}`);
  }
  if (params.date_from) {
    qParams.push(params.date_from);
    where.push(`a.created_at >= $${qParams.length}`);
  }
  if (params.date_to) {
    qParams.push(params.date_to);
    where.push(`a.created_at <= $${qParams.length}`);
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;
  const page = Math.max(1, params.page ?? 1);
  const perPage = 50;
  const offset = (page - 1) * perPage;

  const [countResult, itemsResult] = await Promise.all([
    db.query(`SELECT COUNT(*) AS cnt FROM activity_log a ${whereClause}`, qParams),
    db.query(
      `SELECT a.*, u.full_name AS user_name, u.role AS user_role
       FROM activity_log a
       JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ${perPage} OFFSET ${offset}`,
      qParams,
    ),
  ]);

  return {
    items: itemsResult.rows as ActivityLogItem[],
    total: Number(countResult.rows[0]?.cnt ?? 0),
  };
}

// ─── Post HRG Notes helpers ───────────────────────────────────────────────────
// Notes are stored as a JSON array in hearings.post_hrg_notes (TEXT column).
// Canonical shape: [{ author: string; date: string; content: string }]
// Legacy shape from dashboard: [{ user: string; date: string; note: string }]
// post_hrg_review (BOOLEAN) is set to true whenever a note is added.

function parsePostHrgNotes(raw: unknown): PostHrgNote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    if (Array.isArray(parsed)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return parsed.map((n: any, i: number) => ({
        id: i,
        hearing_id: 0,
        author_name: n.author ?? n.author_name ?? n.user ?? "Unknown",
        content: n.content ?? n.note ?? "",
        created_at: n.date   ?? n.created_at  ?? new Date().toISOString(),
      }));
    }
  } catch { /* fall through */ }
  return [];
}

export async function getPostHrgNotes(hearingId: number): Promise<PostHrgNote[]> {
  try {
    const { rows } = await db.query(
      `SELECT post_hrg_notes FROM hearings WHERE id = $1`,
      [hearingId],
    );
    return parsePostHrgNotes(rows[0]?.post_hrg_notes);
  } catch {
    return [];
  }
}

export async function addPostHrgNote(
  hearingId: number,
  content: string,
): Promise<{ success: boolean; message?: string }> {
  if (!content.trim()) return { success: false, message: "Note cannot be empty" };

  const session = await getSession();

  // Server-side permission check — per PDF matrix, Post HRG Notes Edit:
  // system_admin, admin, manager, mr_admin, mr_lead, mr_agent, post_hearing_admin, post_hearing_staff
  const allowedRoles = [
    "system_admin", "admin", "manager",
    "mr_admin", "mr_lead", "mr_agent",
    "post_hearing_admin", "post_hearing_staff",
  ];
  const userRole = session?.user?.role;
  if (!userRole || !allowedRoles.includes(userRole)) {
    return { success: false, message: "You do not have permission to add notes" };
  }

  // Resolve author name: session.user.name (from auth.ts), fall back to DB lookup
  let authorName = session?.user?.name;
  if (!authorName && session?.user?.id) {
    const { rows: userRows } = await db.query(
      `SELECT full_name FROM users WHERE id = $1`,
      [session.user.id],
    );
    authorName = userRows[0]?.full_name ?? "Unknown";
  }
  if (!authorName) authorName = "Unknown";

  const newNote = JSON.stringify({ author: authorName, date: new Date().toISOString(), content: content.trim() });

  // Atomic prepend — avoids read-modify-write race condition.
  // The CASE handles all possible states of post_hrg_notes:
  //   NULL / empty / '[]' → initialize as new single-element array
  //   Valid JSON array (starts with '[') → prepend by splicing off the leading '[' and inserting new note + comma
  //   Anything else (legacy plain text, "true", malformed) → start fresh array with new note
  await db.query(
    `UPDATE hearings
        SET post_hrg_notes = CASE
              WHEN post_hrg_notes IS NULL OR post_hrg_notes = '' OR post_hrg_notes = '[]'
              THEN ('[' || $1 || ']')
              WHEN post_hrg_notes LIKE '[{%'
              THEN ('[' || $1 || ',' || substring(post_hrg_notes from 2))
              ELSE ('[' || $1 || ']')
            END,
            post_hrg_review = true,
            updated_at = NOW()
      WHERE id = $2`,
    [newNote, hearingId],
  );

  await logActivity("post_hrg_note_added", `Post HRG note added for hearing #${hearingId}`);
  return { success: true };
}

export async function updatePostHrgDeadline(
  hearingId: number,
  deadline: string,
): Promise<{ success: boolean }> {
  await db.transaction(async (client) => {
    await updateSingleFieldAndRecordEvent<string>({
      client,
      hearingId,
      oldValueColumnSql: "post_hrg_deadline::text",
      updateSetSql: "post_hrg_deadline = $2",
      updateParams: [deadline],
      changedField: "post_hrg_deadline",
      newValue: deadline || null,
    });
  });

  await logActivity(
    "post_hrg_deadline_updated",
    deadline
      ? `Post HRG deadline set to "${deadline}" for hearing #${hearingId}`
      : `Post HRG deadline cleared for hearing #${hearingId}`,
  );
  return { success: true };
}

export async function getPostHrgHearings(
  filters: HearingFilters,
): Promise<PaginatedHearingsResult> {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Number(filters.per_page ?? 50);
  const offset = (page - 1) * perPage;

  const params: unknown[] = [];
  const where: string[] = [
    "(h.hearing_decision_status = 'Post HRG Review/ Dev' OR h.medical_record_status = 'Post Hearing Development')",
    "(h.medical_record_status != 'WITHDRAWAL' OR h.medical_record_status IS NULL)",
  ];

  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`h.claimant ILIKE $${params.length}`);
  }

  if (filters.team_filter && filters.team_filter !== "__all__") {
    if (filters.team_filter === "unassigned") {
      where.push("h.mr_team_id IS NULL");
    } else {
      params.push(Number(filters.team_filter));
      where.push(`h.mr_team_id = $${params.length}`);
    }
  }

  if (filters.status_filter && filters.status_filter !== "__all__") {
    params.push(filters.status_filter);
    where.push(`h.medical_record_status = $${params.length}`);
  }

  const whereClause = where.join(" AND ");
  const order = filters.sort_order === "asc" ? "ASC" : "DESC";

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total FROM hearings h WHERE ${whereClause}`,
      params,
    ),
    db.query(
      `SELECT
         h.id, h.claimant, h.hearing_date::text, h.converted_time_est,
         h.medical_record_status, h.hearing_decision_status,
         h.manner_of_appearance, h.five_day_notice, h.task_assigned,
         h.credited, h.post_hrg_review, h.post_hrg_deadline, h.post_hrg_notes,
         h.medical_record_link, h.claimant_link, h.mr_team_id,
         r.name       AS rep_name,
         t.team_name  AS mr_team_name,
         t.team_color AS mr_team_color,
         t.team_type  AS mr_team_type
       FROM hearings h
       LEFT JOIN representatives r ON h.assigned_rep_id = r.id
       LEFT JOIN mr_teams t        ON h.mr_team_id = t.id
       WHERE ${whereClause}
       ORDER BY h.hearing_date ${order}, h.converted_time_est ${order}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, perPage, offset],
    ),
  ]);

  const total = countRes.rows[0]?.total ?? 0;
  return {
    hearings: dataRes.rows as Hearing[],
    total,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
    stats: { total, complete: 0, in_progress: 0, ready: 0, not_started: 0, urgent: 0 },
  };
}

// Inverts the WITHDRAWN_FILTER to fetch ONLY withdrawn/dismissed records.
// ─────────────────────────────────────────────────────────────────────────────

export async function getWithdrawnHearings(filters: {
  page?: number;
  search?: string;
  per_page?: number;
}): Promise<{ hearings: Hearing[]; total: number; total_pages: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = filters.per_page ?? 50;
  const offset = (page - 1) * perPage;

  const params: unknown[] = [];
  const conds: string[] = [
    `(
      h.medical_record_status = 'WITHDRAWAL'
      OR h.hearing_decision_status LIKE 'Withdrawal%'
      OR h.hearing_decision_status = 'WD CLMT DECEASED'
      OR h.hearing_decision_status = 'Dismissal'
    )`,
  ];

  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    conds.push(`h.claimant ILIKE $${params.length}`);
  }

  const where = conds.join(" AND ");

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total FROM hearings h WHERE ${where}`,
      params,
    ),
    db.query(
      `SELECT
         h.*,
         r.name          AS rep_name,
         t.team_name     AS mr_team_name,
         t.team_color    AS mr_team_color,
         t.id            AS mr_team_id,
         h.hearing_date::text AS hearing_date
       FROM hearings h
       LEFT JOIN representatives r ON h.assigned_rep_id = r.id
       LEFT JOIN mr_teams t        ON h.mr_team_id      = t.id
       WHERE ${where}
       ORDER BY h.hearing_date DESC, h.converted_time_est DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, perPage, offset],
    ),
  ]);

  const total = countRes.rows[0]?.total ?? 0;

  return {
    hearings: dataRes.rows as Hearing[],
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getCardStats(
  type: "no_specialist" | "no_task",
  year?: string,
  month?: string,
): Promise<{ count: number; nextHearing: { claimant: string; hearing_date: string } | null }> {
  const where: string[] = [
    `(medical_record_status != 'WITHDRAWAL' OR medical_record_status IS NULL)`,
    type === "no_specialist"
      ? "mr_team_id IS NULL"
      : "(task_assigned IS NULL OR task_assigned = false)",
  ];
  const params: unknown[] = [];

  if (year && month) {
    params.push(`${year}-${month.padStart(2, "0")}`);
    where.push(`TO_CHAR(hearing_date, 'YYYY-MM') = $${params.length}`);
  } else if (year) {
    params.push(year);
    where.push(`EXTRACT(YEAR FROM hearing_date)::text = $${params.length}`);
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  const [countResult, nextResult] = await Promise.all([
    db.query(`SELECT COUNT(*) AS cnt FROM hearings ${whereClause}`, params),
    db.query<HearingDatePreview>(
      `SELECT claimant, hearing_date::text FROM hearings ${whereClause} ORDER BY hearing_date ASC LIMIT 1`,
      params,
    ),
  ]);

  return {
    count: Number(countResult.rows[0]?.cnt ?? 0),
    nextHearing: nextResult.rows[0] ?? null,
  };
}