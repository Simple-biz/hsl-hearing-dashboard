"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { canAccessPage, type UserRole } from "@/lib/roles";
import { usePageAccess } from "@/context/page-access-context";

interface NavItem {
  label: string;
  href: string;
  page: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Hearing Dashboard", href: "/", page: "dashboard" },
  { label: "Rep Dashboard", href: "/representatives", page: "representatives" },
  { label: "Rep Schedule", href: "/schedule", page: "schedule" },
  { label: "Reports", href: "/reports", page: "reports" },
  { label: "MR Pivot", href: "/medical-records", page: "medical_records" },
  { label: "MR Reports", href: "/mr-reports", page: "mr_reports" },
  {
    label: "Rep Docs",
    href: "/representative-docs",
    page: "representative_docs",
  },
  {
    label: "Post-HRG Dev",
    href: "/post-hrg-development",
    page: "post_hrg_development",
  }, // ← ADD THIS
  { label: "Settings", href: "/settings", page: "settings" },
  { label: "Admin", href: "/admin", page: "admin" },
];

interface DashboardNavProps {
  userRole: UserRole;
  children?: React.ReactNode; // Action buttons slot
}

export function DashboardNav({ userRole, children }: DashboardNavProps) {
  const pathname = usePathname();
  // Effective page access from the layout (role default + per-user
  // overrides). Falls back to role-based access if no provider is present.
  const pageAccess = usePageAccess();

  const visibleItems = NAV_ITEMS.filter((item) =>
    pageAccess
      ? pageAccess[item.page] === true
      : canAccessPage(userRole, item.page),
  );

  // Deduplicate by href (Settings and Admin both go to /admin)
  const dedupedItems = visibleItems.reduce<NavItem[]>((acc, item) => {
    if (!acc.some((i) => i.href === item.href)) acc.push(item);
    return acc;
  }, []);

  return (
    <nav className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        {dedupedItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href + item.label}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      {children && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {children}
        </div>
      )}
    </nav>
  );
}
