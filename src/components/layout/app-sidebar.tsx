"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  FileUp,
  FileText,
  ClipboardList,
  FolderCheck,
  BarChart3,
  Users,
  Calendar,
  Shield,
  Settings,
  Key,
  Stethoscope,
  LogOut,
  KeyRound,
  ChevronsUpDown,
} from "lucide-react";
import { type UserRole } from "@/lib/roles";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ============================================================
// NAV CONFIG
// ============================================================
interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  page: string; // key in PAGE_ACCESS
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Main",
    items: [
      {
        label: "Dashboard",
        href: "/",
        icon: LayoutDashboard,
        page: "dashboard",
      },
      { label: "Import", href: "/import", icon: FileUp, page: "import" },
    ],
  },
  {
    label: "Medical",
    items: [
      {
        label: "Medical Records",
        href: "/medical-records",
        icon: Stethoscope,
        page: "medical_records",
      },
      {
        label: "Patient Portal",
        href: "/patient-portal",
        icon: FileText,
        page: "patient_portal",
      },
      { label: "RFC Tracker", href: "/rfc", icon: ClipboardList, page: "rfc" },
      {
        label: "Import RFC",
        href: "/import-rfc",
        icon: FileUp,
        page: "import_rfc",
      },
    ],
  },
  {
    label: "Analytics",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3, page: "reports" },
      {
        label: "MR Reports",
        href: "/mr-reports",
        icon: BarChart3,
        page: "mr_reports",
      },
    ],
  },
  {
    label: "Management",
    items: [
      {
        label: "Representatives",
        href: "/representatives",
        icon: Users,
        page: "representatives",
      },
      {
        label: "Schedule",
        href: "/schedule",
        icon: Calendar,
        page: "schedule",
      },
      {
        label: "Representative Docs",
        href: "/representative-docs",
        icon: FolderCheck,
        page: "representative_docs",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        page: "settings",
      },
      { label: "Admin", href: "/admin", icon: Shield, page: "admin" },
      { label: "API Keys", href: "/api-keys", icon: Key, page: "api_keys" },
    ],
  },
];

// ============================================================
// COMPONENT
// ============================================================
interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userRole: UserRole;
  userName: string;
  userEmail?: string;
  /** Effective per-page access (role default + per-user overrides). */
  pageAccess: Record<string, boolean>;
}

export function AppSidebar({
  userRole,
  userName,
  userEmail,
  pageAccess,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* ── Header: Logo ── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <span className="text-[10px] font-bold">HS</span>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">HSL Hearings</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Hogan Smith Law
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ── Content: Nav groups ── */}
      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          // Filter items by effective page access (role default + overrides)
          const visibleItems = group.items.filter(
            (item) => pageAccess[item.page] === true,
          );
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(item.href));

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                        >
                          <Link href={item.href}>
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      {/* ── Footer: Theme toggle + User ── */}
      <SidebarFooter className="pb-8">
        <SidebarMenu>
          {/* Theme toggle row */}
          <SidebarMenuItem>
            <div className="flex items-center justify-center px-2 py-1">
              <ThemeToggle />
            </div>
          </SidebarMenuItem>

          {/* User menu */}
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{userName}</span>
                    <span className="truncate text-xs capitalize text-muted-foreground">
                      {userRole.replace(/_/g, " ")}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{userName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {userEmail ||
                          `${userName.toLowerCase().replace(/\s/g, ".")}@hogansmith.com`}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => router.push("/change-password")}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Change Password
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
