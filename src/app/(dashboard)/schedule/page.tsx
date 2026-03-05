"use client";

import { useState, useMemo } from "react";
import { AppHeader } from "@/components/layout/app-header";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  // Unlock,
  // Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MOCK_REPS = [
  { id: 1, name: "Sarah Johnson" },
  { id: 2, name: "Michael Chen" },
  { id: 3, name: "Emily Rodriguez" },
  { id: 4, name: "James Wilson" },
];

// Generate mock availability
function getMockAvailability(year: number, month: number) {
  const data: Record<
    string,
    Record<number, { available: boolean; locked: boolean; hearings: number }>
  > = {};
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayOfWeek = new Date(year, month, d).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends

    data[dateStr] = {};
    MOCK_REPS.forEach((rep) => {
      data[dateStr][rep.id] = {
        available: Math.random() > 0.15,
        locked: Math.random() > 0.7,
        hearings: Math.floor(Math.random() * 4),
      };
    });
  }
  return data;
}

export default function SchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const availability = useMemo(
    () => getMockAvailability(year, month),
    [year, month],
  );

  const monthName = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Get all business days in the month
  const businessDays = useMemo(() => {
    const days: string[] = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month, d).getDay();
      if (dow > 0 && dow < 6) {
        days.push(
          `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        );
      }
    }
    return days;
  }, [year, month]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <>
      <AppHeader
        title="Rep Schedule"
        subtitle={`${MOCK_REPS.length} representatives`}
        actions={
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm 
                           font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
          >
            <Lock size={14} /> Lock All
          </button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-muted text-foreground/70 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-lg font-semibold text-foreground">{monthName}</h2>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-muted text-foreground/70 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Schedule grid */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-max">
              <thead>
                <tr className="border-b border-border">
                  <th
                    className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider 
                               text-muted-foreground bg-muted/80 sticky left-0 z-10 min-w-40"
                  >
                    Representative
                  </th>
                  {businessDays.map((date) => {
                    const d = new Date(date + "T00:00:00");
                    const dayNum = d.getDate();
                    const dayName = DAYS[d.getDay()];
                    const isToday =
                      date === new Date().toISOString().split("T")[0];
                    return (
                      <th
                        key={date}
                        className={cn(
                          "px-1 py-2 text-center min-w-13",
                          "text-[10px] font-medium bg-muted/80",
                          isToday ? "text-accent" : "text-muted-foreground",
                        )}
                      >
                        <div>{dayName}</div>
                        <div
                          className={cn(
                            "text-sm font-bold tabular-nums mt-0.5",
                            isToday &&
                              "w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center mx-auto",
                          )}
                        >
                          {dayNum}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {MOCK_REPS.map((rep) => (
                  <tr
                    key={rep.id}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td
                      className="px-4 py-2 text-sm font-medium text-foreground sticky left-0 bg-card z-10 
                                  border-r border-border/50"
                    >
                      {rep.name}
                    </td>
                    {businessDays.map((date) => {
                      const cell = availability[date]?.[rep.id];
                      if (!cell) return <td key={date} className="px-1 py-2" />;

                      return (
                        <td key={date} className="px-1 py-1.5 text-center">
                          <button
                            className={cn(
                              "w-full h-9 rounded-md text-xs font-medium transition-all relative",
                              cell.available
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                : "bg-red-50 text-red-400 hover:bg-red-100 border border-red-200",
                              cell.locked && "ring-1 ring-amber-400",
                            )}
                          >
                            {cell.hearings > 0 && (
                              <span className="tabular-nums">
                                {cell.hearings}
                              </span>
                            )}
                            {cell.locked && (
                              <Lock
                                size={8}
                                className="absolute top-0.5 right-0.5 text-amber-500"
                              />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-emerald-50 border border-emerald-200" />
            Available
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-red-50 border border-red-200" />
            Unavailable
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-emerald-50 border border-emerald-200 ring-1 ring-amber-400" />
            Locked
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-700 font-medium">3</span>= hearings
            scheduled
          </div>
        </div>
      </div>
    </>
  );
}
