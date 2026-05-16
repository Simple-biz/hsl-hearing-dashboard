"use client";

import {
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── StackedDeck ──────────────────────────────────────────────────────────────
// Samsung One UI "stacked widget" style deck: one item shown at full,
// natural height (so dense tables / chart grids are never clipped), with
// decorative card edges peeking behind it for the stacked-folder look.
// Navigate via the dot indicator, ◀ ▶ buttons, horizontal drag/swipe, or
// ←/→ keys when the deck is focused. The deck wraps around.

// True if the gesture started inside a horizontally scrollable element
// (e.g. a wide `overflow-x-auto` table). Such gestures should scroll that
// element, not flip the deck. Walks target → deck root.
function startedInHScroll(e: ReactPointerEvent): boolean {
  let el = e.target as HTMLElement | null;
  const root = e.currentTarget as HTMLElement;
  while (el && el !== root) {
    if (el.scrollWidth > el.clientWidth + 2) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

export interface StackedDeckItem {
  /** Stable key + dot aria-label. */
  id: string;
  /** Shown in the deck's control bar (the per-item heading). */
  title: string;
  /** The section body. Rendered at natural height. */
  content: ReactNode;
  /** Optional accent color for the title pip / active dot. */
  accent?: string;
}

export function StackedDeck({
  items,
  className,
}: {
  items: StackedDeckItem[];
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  // Gesture start state. `swipeable` is decided at pointer-down: only
  // touch/pen, and only when the gesture didn't begin inside a horizontally
  // scrollable element (so wide tables scroll instead of flipping the deck).
  const drag = useRef<{ x: number; y: number; swipeable: boolean } | null>(
    null,
  );

  if (items.length === 0) return null;

  const wrap = (n: number) => (n + items.length) % items.length;
  const go = (dir: 1 | -1) => setIndex((i) => wrap(i + dir));
  const safeIndex = Math.min(index, items.length - 1);
  const active = items[safeIndex];
  const accent = active.accent ?? "var(--color-amber-500, #f59e0b)";

  return (
    <section
      className={cn("relative outline-none", className)}
      aria-roledescription="carousel"
      aria-label="MR report sections"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          go(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(-1);
        }
      }}
    >
      {/* Control bar */}
      <div className="flex items-center gap-3 mb-2.5">
        <h2 className="text-base font-bold flex items-center gap-2 min-w-0">
          <span
            className="w-1 h-5 rounded-full inline-block shrink-0"
            style={{ backgroundColor: accent }}
          />
          <span className="truncate">{active.title}</span>
        </h2>
        <div className="ml-auto flex items-center gap-2.5 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5">
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                aria-label={`Show ${it.title}`}
                aria-current={i === safeIndex}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === safeIndex
                    ? "w-5"
                    : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
                style={
                  i === safeIndex ? { backgroundColor: accent } : undefined
                }
              />
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {safeIndex + 1} / {items.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous section"
              onClick={() => go(-1)}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next section"
              onClick={() => go(1)}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-card hover:bg-muted transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stack — active card in flow (natural height); decorative layers
          peek out at the sides/bottom for the stacked-folder look. */}
      <div
        className="relative"
        onPointerDown={(e) => {
          // Mouse users have the dots/arrows and may be selecting table
          // text — only touch/pen drags flip the deck.
          const isTouch =
            e.pointerType === "touch" || e.pointerType === "pen";
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            swipeable: isTouch && !startedInHScroll(e),
          };
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || !d.swipeable) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          // Require a deliberate, horizontally-dominant swipe.
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            go(dx < 0 ? 1 : -1);
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {items.length > 1 && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-4 -bottom-2.5 top-2.5 rounded-xl border border-border/60 bg-muted/40 shadow-sm"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-2 -bottom-1.5 top-1.5 rounded-xl border border-border/70 bg-muted/60 shadow-sm"
            />
          </>
        )}
        {/* All items stay mounted; only the active one is visible. This keeps
            chart canvases from remounting on every flip and guarantees the
            server and client render an identical tree (no hydration drift). */}
        {items.map((it, i) => (
          <div
            key={it.id}
            hidden={i !== safeIndex}
            // Solid background so the decorative peek layers only show at the
            // offset edges — uniform for `Card` sections and transparent
            // grid sections alike.
            className={cn(
              "relative rounded-xl bg-background",
              i === safeIndex &&
                "animate-in fade-in slide-in-from-right-2 duration-200",
            )}
          >
            {it.content}
          </div>
        ))}
      </div>
    </section>
  );
}
