import { requireAuth } from "@/lib/session";
import { PostHrgClient } from "./post-hrg-client";
import {
  fetchPostHrgDevPage,
  fetchPostHrgDevStats,
  fetchPostHrgOptions,
} from "./actions";

export default async function PostHrgDevelopmentPage() {
  const session = await requireAuth();

  const allowedRoles = [
    "system_admin",
    "admin",
    "post_hearing_admin",
    "post_hearing_staff",
  ];
  if (!allowedRoles.includes(session.user.role)) {
    const { redirect } = await import("next/navigation");
    redirect("/");
  }

  const [initialPage, stats, options] = await Promise.all([
    fetchPostHrgDevPage({ page: 1, pageSize: 100 }),
    fetchPostHrgDevStats(),
    fetchPostHrgOptions(),
  ]);

  return (
    <PostHrgClient
      userRole={session.user.role}
      userId={session.user.id}
      userName={session.user.name || session.user.email || "Unknown"}
      initialRecords={initialPage.records}
      initialTotalFiltered={initialPage.totalFiltered}
      initialStats={stats}
      initialPhStatusOptions={options.phStatusOptions}
      initialRepresentatives={options.representatives}
    />
  );
}
