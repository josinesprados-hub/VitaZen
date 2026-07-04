/**
 * Dashboard Route Loading State
 *
 * Shown instantly by Next.js during client-side route transitions
 * within the (dashboard) route group. Without this file, navigation
 * between pages appears frozen for 1-2 seconds while the target
 * page's JS bundle loads and begins fetching data.
 *
 * This provides immediate visual feedback that a navigation is
 * happening, making the app feel responsive and alive.
 */

export default function DashboardLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 py-4">
      {/* Header placeholder */}
      <div className="space-y-3">
        <div className="h-7 w-48 bg-[#1a1a1a] rounded-md animate-pulse" />
        <div className="h-4 w-72 bg-[#1a1a1a] rounded-md animate-pulse" />
      </div>

      {/* Content blocks placeholder */}
      <div className="space-y-4">
        <div className="h-32 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl animate-pulse"
            />
          ))}
        </div>
        <div className="h-48 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
