/**
 * Dashboard Template
 *
 * Previously used `.page-transition` which started at opacity:0
 * with animation-fill-mode:both — this caused a critical bug where
 * the entire dashboard stayed invisible until user clicked/tapped
 * (WebKit/Chromium compositing bug with nested opacity:0 layers).
 *
 * Now renders immediately without animation wrapper for guaranteed
 * visible content on every navigation.
 */

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
