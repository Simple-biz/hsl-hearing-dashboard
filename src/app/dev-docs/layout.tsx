// Minimal layout for the public developer docs site — no dashboard chrome,
// no auth gate, no shell. Scalar's reference component takes over the full
// viewport and supplies its own three-pane layout (sidebar / endpoint /
// examples).

export default function DevDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen">{children}</div>;
}
