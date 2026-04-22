import { requireAuth } from "@/lib/session";
import { PostHrgClient } from "./post-hrg-client";
import {
  fetchPostHrgDevPage,
  fetchPostHrgDevStats,
  fetchPostHrgOptions,
  fetchPostHrgRecordTypeCounts,
  type PostHrgRecordType,
} from "./actions";

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

  const sp = await searchParams;
  const rawTab = (sp.tab || "").toUpperCase();
  const initialTab: PostHrgRecordType | "all" = (
    VALID_TABS as string[]
  ).includes(rawTab === "ALL" ? "all" : rawTab)
    ? rawTab === "ALL"
      ? "all"
      : (rawTab as PostHrgRecordType)
    : "POST_HRG";

  const [initialPage, stats, options, recordTypeCounts] = await Promise.all([
    fetchPostHrgDevPage({ page: 1, pageSize: 100, recordType: initialTab }),
    fetchPostHrgDevStats(initialTab),
    fetchPostHrgOptions(),
    fetchPostHrgRecordTypeCounts(),
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
    />
  );
}
