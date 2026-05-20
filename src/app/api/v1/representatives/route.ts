// GET /api/v1/representatives — list active representatives.
//
// Lookup endpoint primarily for sister projects that need to resolve
// rep_id → name or render a rep dropdown. Returns active reps only by
// default. Pass ?include_inactive=true to include revoked entries.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-keys";

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth instanceof Response) return auth;

  const includeInactive =
    req.nextUrl.searchParams.get("include_inactive") === "true";

  try {
    const { rows } = await db.query(
      `SELECT id, name, rep_type, is_active
         FROM representatives
        ${includeInactive ? "" : "WHERE is_active = true"}
        ORDER BY name`,
    );
    return Response.json({ data: rows });
  } catch (e) {
    console.error("/api/v1/representatives query failed", e);
    return Response.json(
      {
        error: {
          code: "internal_error",
          message: "Failed to fetch representatives.",
        },
      },
      { status: 500 },
    );
  }
}
