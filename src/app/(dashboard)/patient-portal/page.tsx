"use client";

import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

export default function PatientPortalPage() {
  return (
    <>
      <AppHeader
        title="Patient Portal"
        subtitle="Provider portals & MR retrieval"
      />
      <div className="flex flex-col gap-4 p-4 lg:p-6">
        <Card className="shadow-none">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
            <h2 className="mt-4 text-lg font-semibold">Patient Portal</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Phase 4 - Provider portals, credentials, MR retrieval status,
              specialist assignment
            </p>
            <p className="mt-4 text-xs text-muted-foreground/70">
              Coming soon - Neon database connected
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
