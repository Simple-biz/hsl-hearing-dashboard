"use server";

import { db } from "@/lib/db";
import { logAction } from "@/lib/activity-log";

// ═══════════ USERS ═══════════

export interface AdminUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  force_password_change: boolean;
}

export async function getUsers(): Promise<AdminUser[]> {
  const { rows } = await db.query(
    "SELECT id, full_name, email, role, is_active, last_login::text, force_password_change FROM users ORDER BY full_name",
  );
  return rows as AdminUser[];
}

export async function saveUser(data: {
  id?: number;
  full_name: string;
  email: string;
  role: string;
  password?: string;
  rep_type?: string;
  force_password_change?: boolean;
}) {
  if (data.id) {
    const { rows: oldRows } = await db.query(
      "SELECT role, email FROM users WHERE id=$1",
      [data.id],
    );
    const oldRole = oldRows[0]?.role;
    const oldEmail = oldRows[0]?.email;

    await db.query(
      "UPDATE users SET full_name=$1, email=$2, role=$3 WHERE id=$4",
      [data.full_name, data.email, data.role, data.id],
    );
    if (data.password) {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash(data.password, 10);
      await db.query(
        "UPDATE users SET password_hash=$1, force_password_change=true WHERE id=$2",
        [hash, data.id],
      );
    }

    // If role changed TO rep, create rep profile if not exists
    if (data.role === "rep" && oldRole !== "rep") {
      const { rows: existing } = await db.query(
        "SELECT id FROM representatives WHERE email=$1",
        [data.email],
      );
      if (existing.length === 0 && data.rep_type) {
        await db.query(
          "INSERT INTO representatives (name, email, rep_type, is_active) VALUES ($1,$2,$3,true)",
          [data.full_name, data.email, data.rep_type],
        );
        await logAction(
          "rep_created",
          `Auto-created rep profile for ${data.full_name}`,
        );
      }
    }

    // If role changed FROM rep, deactivate rep profile
    if (oldRole === "rep" && data.role !== "rep") {
      await db.query(
        "UPDATE representatives SET is_active=false WHERE email=$1",
        [oldEmail],
      );
    }

    // Sync name/email to rep profile
    if (data.role === "rep") {
      await db.query(
        "UPDATE representatives SET name=$1, email=$2 WHERE email=$3",
        [data.full_name, data.email, oldEmail || data.email],
      );
    }

    await logAction("user_updated", `${data.full_name} updated (${data.role})`);
    return data.id;
  } else {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(data.password || "changeme123", 10);
    const { rows } = await db.query(
      "INSERT INTO users (full_name, email, password_hash, role, is_active, force_password_change) VALUES ($1,$2,$3,$4,true,$5) RETURNING id",
      [
        data.full_name,
        data.email,
        hash,
        data.role,
        data.force_password_change !== false,
      ],
    );
    await logAction("user_created", `${data.full_name} created (${data.role})`);

    // Auto-create rep profile if role is rep and rep_type provided
    if (data.role === "rep" && data.rep_type) {
      const { rows: existing } = await db.query(
        "SELECT id FROM representatives WHERE email=$1",
        [data.email],
      );
      if (existing.length === 0) {
        await db.query(
          "INSERT INTO representatives (name, email, rep_type, is_active) VALUES ($1,$2,$3,true)",
          [data.full_name, data.email, data.rep_type],
        );
        await logAction(
          "rep_created",
          `Auto-created rep profile for ${data.full_name} (${data.rep_type})`,
        );
      } else {
        await db.query(
          "UPDATE representatives SET is_active=true, name=$1 WHERE email=$2",
          [data.full_name, data.email],
        );
      }
    }

    return rows[0].id as number;
  }
}

export async function toggleUserActive(userId: number, active: boolean) {
  await db.query("UPDATE users SET is_active=$1 WHERE id=$2", [active, userId]);
  const { rows } = await db.query(
    "SELECT full_name, email, role FROM users WHERE id=$1",
    [userId],
  );
  if (rows[0]?.role === "rep") {
    await db.query("UPDATE representatives SET is_active=$1 WHERE email=$2", [
      active,
      rows[0].email,
    ]);
  }
  await logAction(
    "user_updated",
    `${rows[0]?.full_name} ${active ? "activated" : "deactivated"}`,
  );
}

export async function resetUserPassword(userId: number) {
  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash("changeme123", 10);
  await db.query(
    "UPDATE users SET password_hash=$1, force_password_change=true WHERE id=$2",
    [hash, userId],
  );
  const { rows } = await db.query("SELECT full_name FROM users WHERE id=$1", [
    userId,
  ]);
  await logAction("user_updated", `${rows[0]?.full_name} password reset`);
}

export async function deleteUser(userId: number) {
  const { rows } = await db.query("SELECT full_name FROM users WHERE id=$1", [
    userId,
  ]);
  await db.query("DELETE FROM users WHERE id=$1", [userId]);
  await logAction("user_deleted", `${rows[0]?.full_name} deleted`);
}

// ═══════════ CONFIG OPTIONS ═══════════

export interface ConfigOption {
  id: number;
  option_type: string;
  option_value: string;
  option_color: string | null;
  is_active: boolean;
  display_order: number;
}

export async function getConfigOptions(): Promise<ConfigOption[]> {
  const { rows } = await db.query(
    "SELECT id, option_type, option_value, option_color, is_active, display_order FROM config_options ORDER BY option_type, display_order",
  );
  return rows as ConfigOption[];
}

export async function saveConfigOption(data: {
  id?: number;
  option_type: string;
  option_value: string;
  option_color?: string;
}) {
  if (data.id) {
    await db.query(
      "UPDATE config_options SET option_value=$1, option_color=$2 WHERE id=$3",
      [data.option_value, data.option_color || null, data.id],
    );
    await logAction(
      "config_updated",
      `Config option ${data.option_type}: ${data.option_value}`,
    );
    return data.id;
  } else {
    const { rows } = await db.query(
      "INSERT INTO config_options (option_type, option_value, option_color, is_active, display_order) VALUES ($1,$2,$3,true, (SELECT COALESCE(MAX(display_order),0)+1 FROM config_options WHERE option_type=$4)) RETURNING id",
      [
        data.option_type,
        data.option_value,
        data.option_color || null,
        data.option_type,
      ],
    );
    await logAction(
      "config_updated",
      `Config option ${data.option_type}: ${data.option_value}`,
    );
    return rows[0].id as number;
  }
}

export async function toggleConfigOption(id: number, active: boolean) {
  await db.query("UPDATE config_options SET is_active=$1 WHERE id=$2", [
    active,
    id,
  ]);
}

export async function deleteConfigOption(id: number) {
  await db.query("DELETE FROM config_options WHERE id=$1", [id]);
}

// ═══════════ MR TEAMS ═══════════

export interface MrTeam {
  id: number;
  team_name: string;
  team_color: string | null;
  team_type: string;
  is_assignable: boolean;
  is_active: boolean;
  display_order: number;
  member_count: number;
}

export interface MrTeamMember {
  id: number;
  team_id: number;
  member_name: string;
  role: string;
  display_order: number;
}

export async function getMrTeams(): Promise<MrTeam[]> {
  const { rows } = await db.query(`
    SELECT t.id, t.team_name, t.team_color, COALESCE(t.team_type, 'color_team') AS team_type,
           COALESCE(t.is_assignable, true) AS is_assignable, t.is_active, t.display_order,
           COUNT(m.id)::int AS member_count
    FROM mr_teams t
    LEFT JOIN mr_team_members m ON m.team_id = t.id
    GROUP BY t.id ORDER BY t.display_order
  `);
  return rows as MrTeam[];
}

export async function saveMrTeam(data: {
  id?: number;
  team_name: string;
  team_color?: string;
  team_type?: string;
  is_assignable?: boolean;
}) {
  const teamType = data.team_type || "color_team";
  const assignable = data.is_assignable !== false;
  if (data.id) {
    await db.query(
      "UPDATE mr_teams SET team_name=$1, team_color=$2, team_type=$3, is_assignable=$4 WHERE id=$5",
      [data.team_name, data.team_color || null, teamType, assignable, data.id],
    );
    await logAction("config_updated", `MR Team: ${data.team_name}`);
    return data.id;
  } else {
    const { rows } = await db.query(
      "INSERT INTO mr_teams (team_name, team_color, team_type, is_assignable, is_active, display_order) VALUES ($1,$2,$3,$4,true, (SELECT COALESCE(MAX(display_order),0)+1 FROM mr_teams)) RETURNING id",
      [data.team_name, data.team_color || null, teamType, assignable],
    );
    await logAction("config_updated", `MR Team: ${data.team_name}`);
    return rows[0].id as number;
  }
}

export async function toggleMrTeam(id: number, active: boolean) {
  await db.query("UPDATE mr_teams SET is_active=$1 WHERE id=$2", [active, id]);
}

export async function deleteMrTeam(id: number) {
  await db.query("DELETE FROM mr_team_members WHERE team_id=$1", [id]);
  await db.query("DELETE FROM mr_teams WHERE id=$1", [id]);
}

// ── Team Members ──
export async function getTeamMembers(teamId: number): Promise<MrTeamMember[]> {
  const { rows } = await db.query(
    "SELECT id, team_id, member_name, role, display_order FROM mr_team_members WHERE team_id=$1 ORDER BY display_order",
    [teamId],
  );
  return rows as MrTeamMember[];
}

export async function saveTeamMember(data: {
  id?: number;
  team_id: number;
  member_name: string;
  role: string;
}) {
  if (data.id) {
    await db.query(
      "UPDATE mr_team_members SET member_name=$1, role=$2 WHERE id=$3",
      [data.member_name, data.role, data.id],
    );
  } else {
    await db.query(
      "INSERT INTO mr_team_members (team_id, member_name, role, display_order) VALUES ($1,$2,$3, (SELECT COALESCE(MAX(display_order),0)+1 FROM mr_team_members WHERE team_id=$4))",
      [data.team_id, data.member_name, data.role, data.team_id],
    );
  }
  await logAction(
    "config_updated",
    `Team member: ${data.member_name} (${data.role})`,
  );
}

export async function deleteTeamMember(id: number) {
  await db.query("DELETE FROM mr_team_members WHERE id=$1", [id]);
}

// ═══════════ FEDERAL HOLIDAYS ═══════════

export interface FederalHoliday {
  id: number;
  holiday_name: string;
  holiday_date: string;
  year: number;
}

export async function getFederalHolidays(): Promise<FederalHoliday[]> {
  const { rows } = await db.query(
    "SELECT id, holiday_name, holiday_date::text, EXTRACT(YEAR FROM holiday_date)::int AS year FROM federal_holidays ORDER BY holiday_date DESC",
  );
  return rows as FederalHoliday[];
}

export async function saveFederalHoliday(data: {
  id?: number;
  holiday_name: string;
  holiday_date: string;
}) {
  const year = parseInt(data.holiday_date.split("-")[0]);
  if (data.id) {
    await db.query(
      "UPDATE federal_holidays SET holiday_name=$1, holiday_date=$2, year=$3 WHERE id=$4",
      [data.holiday_name, data.holiday_date, year, data.id],
    );
    return data.id;
  } else {
    const { rows } = await db.query(
      "INSERT INTO federal_holidays (holiday_name, holiday_date, year) VALUES ($1,$2,$3) RETURNING id",
      [data.holiday_name, data.holiday_date, year],
    );
    await logAction(
      "config_updated",
      `Holiday: ${data.holiday_name} (${data.holiday_date})`,
    );
    return rows[0].id as number;
  }
}

export async function deleteFederalHoliday(id: number) {
  await db.query("DELETE FROM federal_holidays WHERE id=$1", [id]);
}

// ═══════════ REP DOCS ASSIGNEES ═══════════

export interface RepDocsAssignee {
  id: number;
  name: string;
  is_active: boolean;
  display_order: number;
}

export async function getRepDocsAssignees(): Promise<RepDocsAssignee[]> {
  const { rows } = await db.query(
    "SELECT id, name, is_active, display_order FROM rep_docs_assignees ORDER BY display_order",
  );
  return rows as RepDocsAssignee[];
}

export async function saveRepDocsAssignee(data: { id?: number; name: string }) {
  if (data.id) {
    await db.query("UPDATE rep_docs_assignees SET name=$1 WHERE id=$2", [
      data.name,
      data.id,
    ]);
    return data.id;
  } else {
    const { rows } = await db.query(
      "INSERT INTO rep_docs_assignees (name, is_active, display_order) VALUES ($1,true, (SELECT COALESCE(MAX(display_order),0)+1 FROM rep_docs_assignees)) RETURNING id",
      [data.name],
    );
    return rows[0].id as number;
  }
}

export async function toggleRepDocsAssignee(id: number, active: boolean) {
  await db.query("UPDATE rep_docs_assignees SET is_active=$1 WHERE id=$2", [
    active,
    id,
  ]);
}

export async function deleteRepDocsAssignee(id: number) {
  await db.query("DELETE FROM rep_docs_assignees WHERE id=$1", [id]);
}

// ═══════════ MR SPECIALISTS ═══════════

export interface MrSpecialist {
  id: number;
  name: string;
  bg_color: string | null;
  is_active: boolean;
  display_order: number;
}

export async function getMrSpecialists(): Promise<MrSpecialist[]> {
  const { rows } = await db.query(
    "SELECT id, name, bg_color, is_active, display_order FROM mr_specialists ORDER BY display_order",
  );
  return rows as MrSpecialist[];
}

export async function saveMrSpecialist(data: {
  id?: number;
  name: string;
  bg_color?: string;
}) {
  if (data.id) {
    await db.query(
      "UPDATE mr_specialists SET name=$1, bg_color=$2 WHERE id=$3",
      [data.name, data.bg_color || null, data.id],
    );
    return data.id;
  } else {
    const { rows } = await db.query(
      "INSERT INTO mr_specialists (name, bg_color, is_active, display_order) VALUES ($1,$2,true, (SELECT COALESCE(MAX(display_order),0)+1 FROM mr_specialists)) RETURNING id",
      [data.name, data.bg_color || null],
    );
    await logAction("config_updated", `MR Specialist: ${data.name}`);
    return rows[0].id as number;
  }
}

export async function toggleMrSpecialist(id: number, active: boolean) {
  await db.query("UPDATE mr_specialists SET is_active=$1 WHERE id=$2", [
    active,
    id,
  ]);
}

export async function deleteMrSpecialist(id: number) {
  await db.query("DELETE FROM mr_specialists WHERE id=$1", [id]);
}

// ═══════════ SEND CREDENTIAL EMAILS ═══════════

export async function sendWelcomeEmail(userId: number, password: string) {
  const { rows } = await db.query(
    "SELECT full_name, email, role FROM users WHERE id=$1",
    [userId],
  );
  if (!rows[0]) throw new Error("User not found");
  const { full_name, email, role } = rows[0];
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret)
    throw new Error("N8N webhook not configured");

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": webhookSecret,
    },
    body: JSON.stringify({
      email_type: "new_user_welcome",
      to_email: email,
      to_name: full_name,
      password,
      role: role.replace(/_/g, " "),
      login_url:
        process.env.NEXT_PUBLIC_APP_URL || "https://hearings.hogansmith.com",
    }),
  });
  await logAction(
    "email_sent",
    `Welcome email sent to ${full_name} (${email})`,
  );
}

export async function sendPasswordResetEmail(userId: number, password: string) {
  const { rows } = await db.query(
    "SELECT full_name, email FROM users WHERE id=$1",
    [userId],
  );
  if (!rows[0]) throw new Error("User not found");
  const { full_name, email } = rows[0];
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://hearings.hogansmith.com";
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret)
    throw new Error("N8N webhook not configured");

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": webhookSecret,
    },
    body: JSON.stringify({
      email_type: "password_reset",
      to_email: email,
      to_name: full_name,
      password,
      subject: "Your HSL Password Has Been Reset",
      login_url: appUrl,
      body: `Hello ${full_name},\n\nYour password has been reset.\n\nLogin URL: ${appUrl}\nEmail: ${email}\nNew Password: ${password}\n\nPlease log in and change your password.\n\nHogan Smith Law`,
    }),
  });
  await logAction(
    "email_sent",
    `Password reset email sent to ${full_name} (${email})`,
  );
}

export async function resetUserPasswordCustom(
  userId: number,
  password: string,
  forceChange: boolean,
) {
  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash(password, 10);
  await db.query(
    "UPDATE users SET password_hash=$1, force_password_change=$2 WHERE id=$3",
    [hash, forceChange, userId],
  );
  const { rows } = await db.query("SELECT full_name FROM users WHERE id=$1", [
    userId,
  ]);
  await logAction(
    "user_updated",
    `${rows[0]?.full_name} password reset${forceChange ? " (force change)" : ""}`,
  );
}

export async function sendVideoTutorialEmail(userId: number, password: string) {
  const { rows } = await db.query(
    "SELECT full_name, email, role FROM users WHERE id=$1",
    [userId],
  );
  if (!rows[0]) throw new Error("User not found");
  const { full_name, email, role } = rows[0];
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret)
    throw new Error("N8N webhook not configured");

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": webhookSecret,
    },
    body: JSON.stringify({
      email_type: "scheduling_video_tutorial",
      to_email: email,
      to_name: full_name,
      password,
      role: role.replace(/_/g, " "),
      login_url:
        process.env.NEXT_PUBLIC_APP_URL || "https://hearings.hogansmith.com",
    }),
  });
  await logAction(
    "email_sent",
    `Scheduling video tutorial sent to ${full_name} (${email})`,
  );
}

// ── Add this to your admin page's actions.ts (e.g. app/(dashboard)/admin/actions.ts) ──

export async function bulkCreateUsers(
  users: {
    full_name: string;
    email: string;
    role: string;
    password: string;
    rep_type?: string;
    force_password_change?: boolean;
  }[],
): Promise<{
  created: { full_name: string; email: string }[];
  skipped: { email: string; reason: string }[];
  newUsers: AdminUser[];
}> {
  const bcryptjs = await import("bcryptjs");
  const { logAction } = await import("@/lib/activity-log");

  const created: { full_name: string; email: string }[] = [];
  const skipped: { email: string; reason: string }[] = [];
  const newUsers: AdminUser[] = [];

  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    const fullName = user.full_name.trim();

    if (!email || !fullName) {
      skipped.push({
        email: email || "(empty)",
        reason: "Missing name or email",
      });
      continue;
    }

    // Check for existing user
    const { rows: existing } = await db.query(
      "SELECT id FROM users WHERE LOWER(email) = $1",
      [email],
    );
    if (existing.length > 0) {
      skipped.push({ email, reason: "Email already exists" });
      continue;
    }

    try {
      const passwordHash = await bcryptjs.hash(user.password, 10);
      const forceChange = user.force_password_change !== false;
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, full_name, role, is_active, force_password_change)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING id, email, full_name, role, is_active, last_login, created_at`,
        [email, passwordHash, fullName, user.role || "staff", forceChange],
      );
      if (rows[0]) {
        created.push({ full_name: fullName, email });
        newUsers.push(rows[0] as AdminUser);

        // Log individual user creation
        await logAction(
          "user_created",
          `Created user: ${fullName} (${email}) as ${user.role}${user.role === "rep" ? ` [${user.rep_type || "in-house"}]` : ""}`,
        );

        // Create rep profile if role is rep
        if (user.role === "rep") {
          const repType = user.rep_type || "in-house";
          try {
            await db.query(
              `INSERT INTO representatives (name, email, rep_type, is_active, daily_limit, weekly_limit)
               VALUES ($1, $2, $3, true, 10, 50)`,
              [fullName, email, repType],
            );
          } catch {
            // Rep profile creation failed but user was created
          }
        }
      }
    } catch {
      skipped.push({ email, reason: "Insert failed" });
    }
  }

  if (created.length > 0) {
    await logAction(
      "bulk_create_users",
      `Bulk created ${created.length} users: ${created.map((c) => c.email).join(", ")}`,
    );
  }

  return { created, skipped, newUsers };
}
