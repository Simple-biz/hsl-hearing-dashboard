"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Mail, Clock, Calendar } from "lucide-react";

interface Representative {
  id: number;
  name: string;
  email: string | null;
  rep_type: string;
  is_active: boolean;
  priority: number;
  daily_limit: number;
  weekly_limit: number;
  timezone: string;
  preferred_monthly_hearings: number | null;
  hearing_restriction: string;
}

// Mock data - will be replaced with Neon queries
const MOCK_REPS: Representative[] = [
  {
    id: 1,
    name: "Sarah Johnson",
    email: "sarah@hogansmith.com",
    rep_type: "in-house",
    is_active: true,
    priority: 5,
    daily_limit: 3,
    weekly_limit: 12,
    timezone: "America/New_York",
    preferred_monthly_hearings: 20,
    hearing_restriction: "none",
  },
  {
    id: 2,
    name: "Michael Chen",
    email: "michael@hogansmith.com",
    rep_type: "in-house",
    is_active: true,
    priority: 4,
    daily_limit: 3,
    weekly_limit: 12,
    timezone: "America/Chicago",
    preferred_monthly_hearings: 18,
    hearing_restriction: "none",
  },
  {
    id: 3,
    name: "Emily Rodriguez",
    email: "emily@hogansmith.com",
    rep_type: "contract",
    is_active: true,
    priority: 3,
    daily_limit: 2,
    weekly_limit: 8,
    timezone: "America/New_York",
    preferred_monthly_hearings: 12,
    hearing_restriction: "video_only",
  },
  {
    id: 4,
    name: "James Wilson",
    email: "james@hogansmith.com",
    rep_type: "external_advocates",
    is_active: false,
    priority: 2,
    daily_limit: 2,
    weekly_limit: 6,
    timezone: "America/Denver",
    preferred_monthly_hearings: null,
    hearing_restriction: "none",
  },
];

const REP_TYPE_COLORS: Record<string, string> = {
  "in-house":
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  contract:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  internal_advocates:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  external_advocates:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export default function RepresentativesPage() {
  const [showInactive, setShowInactive] = useState(false);

  const reps = showInactive ? MOCK_REPS : MOCK_REPS.filter((r) => r.is_active);

  return (
    <>
      <AppHeader
        title="Representatives"
        subtitle={`${MOCK_REPS.filter((r) => r.is_active).length} active representatives`}
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs">
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Rep</span>
          </Button>
        }
      />

      <div className="flex flex-col gap-4 p-4 lg:p-6">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive
        </label>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reps.map((rep) => (
            <Card
              key={rep.id}
              className={`shadow-none ${!rep.is_active ? "opacity-60" : ""}`}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{rep.name}</h3>
                    {rep.email && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground truncate">
                          {rep.email}
                        </span>
                      </div>
                    )}
                  </div>
                  <Badge
                    className={`text-[10px] ${REP_TYPE_COLORS[rep.rep_type] || "bg-muted text-muted-foreground"}`}
                  >
                    {rep.rep_type.replace(/_/g, " ")}
                  </Badge>
                </div>

                <div className="rounded-lg bg-muted/50 px-3 py-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Priority</span>
                    <span className="font-medium">{rep.priority}/10</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      Daily / Weekly
                    </span>
                    <span className="font-medium">
                      {rep.daily_limit} / {rep.weekly_limit}
                    </span>
                  </div>
                  {rep.preferred_monthly_hearings && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Monthly Target
                      </span>
                      <span className="font-medium">
                        {rep.preferred_monthly_hearings}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {rep.timezone.split("/").pop()?.replace(/_/g, " ")}
                  </div>
                  {rep.hearing_restriction !== "none" && (
                    <Badge variant="outline" className="text-[10px]">
                      {rep.hearing_restriction.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs"
                >
                  Edit
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
