// Ambient module declarations for side-effect CSS imports. The CSS itself
// is handled at bundle time by Next.js / webpack — these declarations only
// tell TypeScript "yes, this import path is legal."
//
// Needed when `noUncheckedSideEffectImports` (TS 5.6+) is in effect — under
// that option TypeScript won't accept `import "./globals.css"` without a
// matching module declaration.

declare module "*.css";
declare module "@scalar/api-reference-react/style.css";
