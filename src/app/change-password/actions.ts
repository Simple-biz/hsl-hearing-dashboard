"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { compare, hash } from "bcryptjs";

export async function changePassword(data: {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
  forced: boolean;
}) {
  const session = await getSession();
  if (!session?.user) throw new Error("Not authenticated");

  if (data.newPassword !== data.confirmPassword)
    throw new Error("Passwords do not match");
  if (data.newPassword.length < 8)
    throw new Error("Password must be at least 8 characters");

  const { rows } = await db.query(
    "SELECT password_hash, force_password_change FROM users WHERE id=$1",
    [session.user.id],
  );
  if (!rows[0]) throw new Error("User not found");

  // For voluntary changes, verify current password
  if (!data.forced && !rows[0].force_password_change) {
    if (!data.currentPassword) throw new Error("Current password is required");
    const valid = await compare(data.currentPassword, rows[0].password_hash);
    if (!valid) throw new Error("Current password is incorrect");
  }

  const hashed = await hash(data.newPassword, 10);
  await db.query(
    "UPDATE users SET password_hash=$1, force_password_change=false WHERE id=$2",
    [hashed, session.user.id],
  );

  return { success: true };
}
