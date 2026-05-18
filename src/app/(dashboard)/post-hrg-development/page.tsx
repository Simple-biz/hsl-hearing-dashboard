import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/roles";
import { canUserAccessPage } from "@/lib/page-access";
import { PostHrgClient } from "./post-hrg-client";
import {
  fetchPostHrgDevPage,
  fetchPostHrgDevStats,
  fetchPostHrgOptions,
  fetchPostHrgRecordTypeCounts,
  fetchPostHrgCompletedCount,
  type PostHrgRecordType,
} from "./actions";
import { getUserFieldOverridesPlain } from "@/lib/field-access";

const VALID_TABS: Array<PostHrgRecordType | "all"> = [
  "POST_HRG",
  "MR",
  "REP",
  "all",
];

export default async function PostHrgDevelopmentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireAuth();

  // Server-side route protection — role default + per-user page overrides.
  if (
    !(await canUserAccessPage(
      Number(session.user.id),
      session.user.role as UserRole,
      "post_hrg_development",
    ))
  ) {
    redirect("/");
  }

  const sp = await searchParams;
  const rawTab = (sp.tab || "").toUpperCase();
  // Default to "all" so the team sees everything on first load.
  // A specific tab is honoured only when an explicit ?tab= URL param is set.
  const initialTab: PostHrgRecordType | "all" = (
    VALID_TABS as string[]
  ).includes(rawTab === "ALL" ? "all" : rawTab)
    ? rawTab === "ALL"
      ? "all"
      : (rawTab as PostHrgRecordType)
    : "all";

  const [
    initialPage,
    stats,
    options,
    recordTypeCounts,
    completedCount,
    recordsClosedCount,
    fieldOverrides,
  ] = await Promise.all([
    fetchPostHrgDevPage({ page: 1, pageSize: 100, recordType: initialTab }),
    fetchPostHrgDevStats(initialTab),
    fetchPostHrgOptions(),
    fetchPostHrgRecordTypeCounts(),
    fetchPostHrgCompletedCount(),
    fetchPostHrgCompletedCount("records closed"),
    getUserFieldOverridesPlain(
      Number(session.user.id),
      "post_hrg_development",
    ),
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
      initialStatusOptions={options.statusOptions}
      initialRepresentatives={options.representatives}
      initialResponsibleOptions={options.responsibleOptions}
      initialDocsNeededOptions={options.docsNeededOptions}
      initialRecordType={initialTab}
      initialRecordTypeCounts={recordTypeCounts}
      initialCompletedCount={completedCount}
      initialRecordsClosedCount={recordsClosedCount}
      fieldOverrides={fieldOverrides}
    />
  );
}
