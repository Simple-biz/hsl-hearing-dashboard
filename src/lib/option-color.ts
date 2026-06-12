import type { CSSProperties } from "react";

// Shared helper for rendering config-driven status colours (config_options.option_color).
// Settings → status options store a hex like "#a855f7"; this turns it into an inline
// style with a readable text colour chosen by perceived brightness — the same formula
// the dashboard already uses for post-HRG / docs-assignee colours.
export function optionColorStyle(
  hex: string | null | undefined,
): CSSProperties | undefined {
  if (!hex) return undefined;
  const m = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return undefined;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const isLight = (r * 299 + g * 587 + b * 114) / 1000 > 128;
  return { backgroundColor: `#${m}`, color: isLight ? "#1f2937" : "#ffffff" };
}
