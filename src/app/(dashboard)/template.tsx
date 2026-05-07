/**
 * Dashboard Template — Premium Page Transitions
 *
 * In Next.js App Router, `template.tsx` re-mounts on every navigation
 * (unlike `layout.tsx` which persists). This allows us to apply a
 * CSS-only entrance animation each time the user navigates between
 * dashboard pages — zero JS overhead, no libraries needed.
 *
 * The animation is defined in globals.css as `.page-transition`.
 */

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="page-transition">{children}</div>;
}
