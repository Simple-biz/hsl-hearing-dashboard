// User-adjustable font/UI size preference. Applies a `data-font-size`
// attribute on <html>; CSS rules in globals.css read that attribute and
// scale the app via `zoom`. Persisted in localStorage. A small inline
// script in the root layout reads this on page load so the class is
// applied before paint (no FOUC).

export type FontSize = "sm" | "md" | "lg" | "xl";

export const FONT_SIZE_OPTIONS: Array<{
  value: FontSize;
  label: string;
  description: string;
}> = [
  { value: "sm", label: "Small", description: "Denser. More fits on screen." },
  { value: "md", label: "Default", description: "Standard sizing." },
  {
    value: "lg",
    label: "Large",
    description: "Easier to read. Slightly larger UI.",
  },
  {
    value: "xl",
    label: "Extra Large",
    description: "Largest. For low-vision use.",
  },
];

const STORAGE_KEY = "hsl-font-size";
const DEFAULT_SIZE: FontSize = "md";

export function isFontSize(v: unknown): v is FontSize {
  return v === "sm" || v === "md" || v === "lg" || v === "xl";
}

/** Read the saved preference. SSR-safe: returns default on the server. */
export function loadFontSize(): FontSize {
  if (typeof window === "undefined") return DEFAULT_SIZE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isFontSize(raw) ? raw : DEFAULT_SIZE;
  } catch {
    return DEFAULT_SIZE;
  }
}

/** Persist and apply the preference. Safe to call from any client. */
export function saveFontSize(size: FontSize): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, size);
  } catch {
    /* private-mode etc. — ignore */
  }
  applyFontSize(size);
}

/** Apply a size class without persisting (used for previews). */
export function applyFontSize(size: FontSize): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-font-size", size);
}

/**
 * Source for the pre-hydration inline script. Inlined into <head> as a
 * dangerouslySetInnerHTML string so it runs synchronously before React
 * mounts and before the first paint, preventing a flash of unzoomed UI.
 */
export const FONT_SIZE_BOOT_SCRIPT = `
(function(){try{
  var k='${STORAGE_KEY}';
  var v=window.localStorage.getItem(k);
  if(v==='sm'||v==='md'||v==='lg'||v==='xl'){
    document.documentElement.setAttribute('data-font-size',v);
  }
}catch(e){}})();
`;
