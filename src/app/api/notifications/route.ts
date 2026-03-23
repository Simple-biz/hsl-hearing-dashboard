import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await db.query(`
      SELECT n.*, u.full_name AS created_by_name
      FROM sync_notifications n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE n.expires_at > NOW()
      ORDER BY n.created_at DESC
      LIMIT 50
    `);
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error("[GET /api/notifications] failed:", err);
    return NextResponse.json([], { status: 200 });
  }
}
