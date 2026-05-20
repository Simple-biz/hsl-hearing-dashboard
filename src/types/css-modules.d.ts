// Ambient module declarations for side-effect CSS imports from third-party
// packages that don't ship their own .d.ts entries. The CSS itself is
// handled at bundle time by Next.js / webpack — this declaration only
// tells TypeScript "yes, this import path is legal."

declare module "@scalar/api-reference-react/style.css";
