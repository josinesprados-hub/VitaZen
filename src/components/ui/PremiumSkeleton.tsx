'use client';

import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════
// Primitive Skeleton Elements
// ═══════════════════════════════════════════

/** Base shimmer block — the atom of all skeletons */
export function SkeletonBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('premium-shimmer rounded-md', className)} style={style} />;
}

/** Circular skeleton — icons, rings, avatars */
export function SkeletonCircle({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn('premium-shimmer rounded-full', className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Text line skeleton — simulates a line of text */
export function SkeletonLine({ width = '100%', className }: { width?: string; className?: string }) {
  return (
    <div
      className={cn('premium-shimmer rounded h-3', className)}
      style={{ width }}
    />
  );
}

/** Progress bar skeleton */
export function SkeletonBar({ width = '100%', height = '0.375rem', className }: { width?: string; height?: string; className?: string }) {
  return (
    <div className={cn('bg-[#1a1a1a] rounded-full overflow-hidden', className)}>
      <div
        className="premium-shimmer rounded-full"
        style={{ width, height }}
      />
    </div>
  );
}

/** Card wrapper for skeleton content */
export function SkeletonCard({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn('bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5', className)}>
      {children}
    </div>
  );
}

/** Icon placeholder — mimics the icon-sm / icon-md / icon-lg containers */
export function SkeletonIcon({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = {
    sm: 'w-9 h-9 rounded-lg',
    md: 'w-10 h-10 rounded-lg',
    lg: 'w-12 h-12 rounded-xl',
  };
  return <div className={cn('premium-shimmer', sizeClasses[size], className)} />;
}

/** Metric value + label skeleton */
export function SkeletonMetric({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <SkeletonLine width="40%" className="h-2.5" />
      <SkeletonLine width="60%" className="h-6" />
      <SkeletonLine width="50%" className="h-2" />
    </div>
  );
}

// ═══════════════════════════════════════════
// Page-Level Composed Skeletons
// ═══════════════════════════════════════════

/** Dashboard page skeleton — matches the actual two-column dashboard layout */
export function DashboardSkeleton() {
  return (
    <div className="max-w-5xl mx-auto skeleton-entrance">
      <div className="lg:grid lg:grid-cols-12 lg:gap-12 xl:gap-16">
        {/* Left Column */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6 sm:space-y-8">
          {/* Greeting + Silent Memory */}
          <div className="pt-2 sm:pt-4 space-y-3">
            <SkeletonLine width="55%" className="h-7 sm:h-8" />
            <SkeletonLine width="70%" className="h-3.5" />
          </div>

          {/* Emotional Hero */}
          <div className="py-2 sm:py-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <SkeletonCircle size={8} />
              <SkeletonLine width="80px" className="h-3" />
            </div>
            <SkeletonLine width="90%" className="h-5 sm:h-6" />
            <SkeletonLine width="60%" className="h-4" />
          </div>

          {/* Reflection */}
          <div className="space-y-2">
            <SkeletonLine width="100%" className="h-3" />
            <SkeletonLine width="75%" className="h-3" />
          </div>

          {/* Check-in invitation */}
          <div className="flex items-center gap-3">
            <SkeletonBlock className="w-9 h-9 rounded-lg shrink-0" />
            <SkeletonLine width="140px" className="h-3.5" />
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6 sm:space-y-8 mt-6 lg:mt-0 lg:pt-2">
          {/* Empire list */}
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 sm:py-3 px-2">
                <SkeletonBlock className="w-8 h-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <SkeletonLine width="50%" className="h-3" />
                    <SkeletonLine width="30px" className="h-2" />
                  </div>
                  <SkeletonBar width="100%" height="1px" className="rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Insights page skeleton */
export function InsightsSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-10 skeleton-entrance">
      {/* Header */}
      <div className="flex items-center gap-4">
        <SkeletonBlock className="w-10 h-10 rounded-lg" />
        <div className="space-y-2">
          <SkeletonLine width="200px" className="h-7" />
          <SkeletonLine width="140px" className="h-3" />
        </div>
      </div>

      {/* Wellness Score */}
      <SkeletonCard className="p-7">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <SkeletonIcon size="sm" />
            <SkeletonLine width="180px" className="h-5" />
          </div>
          <div className="text-right space-y-1">
            <SkeletonLine width="50px" className="h-8 ml-auto" />
            <SkeletonLine width="70px" className="h-3 ml-auto" />
          </div>
        </div>
        <SkeletonBar width="100%" height="0.75rem" className="rounded-full mb-4" />
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="h-9 w-32 rounded-lg" />
          ))}
        </div>
      </SkeletonCard>

      {/* Weekly Comparison (Premium) */}
      <SkeletonCard className="p-7 border-champagne/15">
        <div className="flex items-center gap-3 mb-5">
          <SkeletonIcon size="sm" />
          <SkeletonLine width="160px" className="h-5" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} className="p-4 bg-[#111]">
              <SkeletonLine width="60%" className="h-3 mb-2" />
              <SkeletonLine width="40%" className="h-4" />
            </SkeletonCard>
          ))}
        </div>
      </SkeletonCard>

      {/* Insights Cards */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <SkeletonIcon size="sm" />
          <SkeletonLine width="160px" className="h-5" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} className="p-5">
              <div className="flex items-start gap-4">
                <SkeletonCircle size={28} className="shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <SkeletonLine width="40%" className="h-4" />
                    <SkeletonBlock className="h-4 w-16 rounded-full" />
                  </div>
                  <SkeletonLine width="90%" className="h-3" />
                  <SkeletonLine width="75%" className="h-3" />
                </div>
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>

      {/* Detailed Metrics Grid */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <SkeletonIcon size="sm" />
          <SkeletonLine width="130px" className="h-5" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <SkeletonCard key={i} className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <SkeletonCircle size={16} className="shrink-0" />
                <SkeletonLine width="55%" className="h-2.5" />
              </div>
              <SkeletonLine width="35%" className="h-7" />
              <SkeletonLine width="50%" className="h-2.5 mt-1" />
            </SkeletonCard>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Logros (achievements) page skeleton */
export function LogrosSkeleton() {
  return (
    <div className="max-w-5xl mx-auto skeleton-entrance">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <SkeletonIcon size="md" />
          <SkeletonLine width="100px" className="h-7" />
        </div>
        <SkeletonLine width="260px" className="h-4 mt-2" />
      </div>

      {/* Stats Bar */}
      <SkeletonCard className="p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <SkeletonIcon size="md" />
            <div className="space-y-2">
              <SkeletonLine width="140px" className="h-4" />
              <SkeletonLine width="180px" className="h-3" />
            </div>
          </div>
          <SkeletonLine width="50px" className="h-8" />
        </div>
        <SkeletonBar width="100%" height="0.75rem" className="rounded-full" />
      </SkeletonCard>

      {/* Filter pills */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <SkeletonBlock key={i} className="h-9 w-24 rounded-full shrink-0" />
        ))}
      </div>

      {/* Unlocked section */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-5">
          <SkeletonCircle size={16} className="shrink-0" />
          <SkeletonLine width="120px" className="h-4" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} className="p-5">
              <div className="flex items-start gap-4">
                <SkeletonBlock className="w-12 h-12 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <SkeletonLine width="50%" className="h-2.5" />
                  <SkeletonLine width="70%" className="h-4" />
                  <SkeletonLine width="90%" className="h-3" />
                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between">
                      <SkeletonLine width="30%" className="h-2.5" />
                      <SkeletonLine width="20%" className="h-2.5" />
                    </div>
                    <SkeletonBar width="100%" height="0.375rem" className="rounded-full" />
                  </div>
                </div>
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Timeline page skeleton */
export function TimelineSkeleton() {
  return (
    <div className="max-w-3xl mx-auto skeleton-entrance">
      {/* Header */}
      <div className="mb-10 sm:mb-14">
        <SkeletonLine width="100px" className="h-7" />
        <SkeletonLine width="180px" className="h-4 mt-2" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-10 sm:mb-14">
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonBlock key={i} className="h-9 w-20 rounded-full shrink-0" />
        ))}
      </div>

      {/* Memory fragments */}
      <div className="space-y-16 sm:space-y-20">
        {[1, 2].map((group) => (
          <div key={group}>
            {/* Day label */}
            <div className="mb-6 sm:mb-8">
              <SkeletonLine width="120px" className="h-4" />
              <SkeletonLine width="60px" className="h-2.5 mt-1.5" />
            </div>

            {/* Items */}
            <div className="space-y-3 sm:space-y-4 pl-2 sm:pl-3 border-l border-[#1a1a1a] ml-1">
              {[1, 2].map((item) => (
                <div key={item} className="pl-5 sm:pl-6">
                  {item === 1 ? (
                    /* Substantial fragment */
                    <SkeletonCard className="px-4 py-3.5 sm:px-5 sm:py-4">
                      <div className="space-y-2.5">
                        <SkeletonLine width="30%" className="h-2" />
                        <SkeletonLine width="60%" className="h-3.5" />
                        <SkeletonLine width="85%" className="h-2.5" />
                      </div>
                    </SkeletonCard>
                  ) : (
                    /* Light fragment */
                    <div className="flex items-baseline gap-2.5">
                      <SkeletonLine width="90px" className="h-3" />
                      <SkeletonLine width="50px" className="h-2.5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mentor chat page skeleton */
export function MentorSkeleton() {
  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-8rem)] flex flex-col skeleton-entrance">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <SkeletonBlock className="w-12 h-12 rounded-xl" />
          <div className="space-y-2">
            <SkeletonLine width="120px" className="h-6" />
            <SkeletonLine width="180px" className="h-3" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-8 w-24 rounded-full" />
          <SkeletonBlock className="w-9 h-9 rounded-lg" />
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Sidebar */}
        <div className="shrink-0 w-72 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl flex flex-col overflow-hidden">
          {/* Back + New */}
          <div className="p-3 border-b border-[#1a1a1a] space-y-2">
            <SkeletonLine width="60px" className="h-3" />
            <SkeletonBlock className="h-10 w-full rounded-lg" />
          </div>
          {/* Tabs */}
          <div className="flex border-b border-[#1a1a1a]">
            <SkeletonBlock className="flex-1 h-10" />
            <SkeletonBlock className="flex-1 h-10" />
          </div>
          {/* Thread list */}
          <div className="flex-1 p-2 space-y-1">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonBlock key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
          {/* Bottom bar */}
          <div className="p-3 border-t border-[#1a1a1a]">
            <SkeletonBar width="100%" height="0.375rem" className="rounded-full" />
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl flex flex-col min-w-0">
          {/* Chat header */}
          <div className="px-5 py-3 border-b border-[#1a1a1a]">
            <div className="flex items-center gap-2">
              <SkeletonCircle size={14} />
              <SkeletonLine width="50%" className="h-4" />
            </div>
          </div>
          {/* Messages area */}
          <div className="flex-1 p-5 space-y-4">
            {/* Welcome state */}
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4">
                <SkeletonBlock className="w-16 h-16 rounded-2xl mx-auto" />
                <SkeletonLine width="140px" className="h-5 mx-auto" />
                <SkeletonLine width="250px" className="h-3 mx-auto" />
                <SkeletonLine width="200px" className="h-3 mx-auto" />
                <div className="flex gap-2 justify-center mt-4">
                  {[1, 2, 3].map((i) => (
                    <SkeletonBlock key={i} className="h-7 w-40 rounded-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Input */}
          <div className="p-4 border-t border-[#1a1a1a]">
            <SkeletonBlock className="h-10 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Check-in page skeleton */
export function CheckinSkeleton() {
  return (
    <div className="max-w-4xl mx-auto skeleton-entrance">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 sm:mb-7">
        <div className="flex items-center gap-2.5">
          <SkeletonIcon size="sm" />
          <SkeletonLine width="170px" className="h-6" />
        </div>
        <SkeletonBlock className="h-9 w-24 rounded-lg" />
      </div>

      {/* Today Summary */}
      <SkeletonCard className="p-3 sm:p-4 mb-5 sm:mb-7 border-champagne/10 rounded-lg">
        <div className="flex items-center gap-2.5 mb-3">
          <SkeletonCircle size={18} className="shrink-0" />
          <div className="space-y-1.5 flex-1">
            <SkeletonLine width="45%" className="h-3" />
            <SkeletonLine width="55%" className="h-2.5" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="text-center space-y-1.5">
              <SkeletonLine width="45%" className="h-4 mx-auto" />
              <SkeletonLine width="35%" className="h-2 mx-auto" />
            </div>
          ))}
        </div>
      </SkeletonCard>

      {/* Trends */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-3">
          <SkeletonCircle size={14} className="shrink-0" />
          <SkeletonLine width="100px" className="h-4.5" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} className="p-2.5 sm:p-3 rounded-lg">
              <div className="flex items-center gap-1.5 mb-2">
                <SkeletonCircle size={10} className="shrink-0" />
                <SkeletonLine width="50%" className="h-2" />
              </div>
              <SkeletonLine width="30%" className="h-5" />
              <div className="flex items-end gap-[3px] h-5 mt-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((bar) => (
                  <div key={bar} className="flex-1 h-5 rounded-sm bg-[#1a1a1a] overflow-hidden">
                    <SkeletonBlock className="w-full rounded-sm" style={{ height: `${30 + ((i * 17 + bar * 11) % 60)}%` }} />
                  </div>
                ))}
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>

      {/* History */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <SkeletonCircle size={14} className="shrink-0" />
          <SkeletonLine width="80px" className="h-4.5" />
        </div>
        <div className="space-y-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} className="px-3 py-3 rounded-lg">
              <div className="flex items-center gap-3">
                <SkeletonCircle size={16} className="shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <SkeletonLine width="40px" className="h-2.5" />
                    <SkeletonLine width="35%" className="h-2.5" />
                  </div>
                  <div className="flex gap-3">
                    {[1, 2, 3, 4].map((j) => (
                      <SkeletonLine key={j} width="25px" className="h-2" />
                    ))}
                  </div>
                </div>
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Emotional Hero skeleton — replaces inline skeleton in EmotionalHero component */
export function EmotionalHeroSkeleton() {
  return (
    <div className="hero-section-container skeleton-entrance">
      <div className="hero-section-card">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-4 sm:mb-8">
          <div className="flex items-start gap-2 sm:gap-4">
            <SkeletonBlock className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl shrink-0" />
            <div className="space-y-2">
              <div className="flex items-center gap-2 sm:gap-2.5">
                <SkeletonLine width="100px" className="h-4 sm:h-5" />
                <SkeletonBlock className="h-4 sm:h-5 w-14 sm:w-16 rounded-full" />
              </div>
              <SkeletonLine width="250px" className="h-2.5 sm:h-3" />
              <SkeletonLine width="200px" className="h-2.5 sm:h-3" />
            </div>
          </div>
          <div className="sm:text-right space-y-2 hidden sm:block">
            <SkeletonLine width="200px" className="h-3 sm:ml-auto" />
            <SkeletonLine width="160px" className="h-2.5 sm:ml-auto" />
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1 sm:gap-2">
              <SkeletonCircle size={48} />
              <SkeletonLine width="2.5rem" className="h-2 sm:h-2.5" />
              <SkeletonLine width="1.5rem" className="h-2.5 sm:h-3" />
            </div>
          ))}
        </div>
        <div className="mt-3 sm:mt-6 pt-2 sm:pt-4 border-t border-[#1a1a1a]/60">
          <SkeletonLine width="140px" className="h-2 sm:h-2.5" />
        </div>
      </div>
    </div>
  );
}

/** Empire page skeleton — reusable for all 5 empire pages (mente, energia, disciplina, riqueza, crecimiento)
 *  Provides a warm loading message and structured skeleton matching the empire page layout. */
export function EmpireSkeleton({ message }: { message: string }) {
  return (
    <div className="max-w-4xl mx-auto space-y-8 skeleton-entrance">
      {/* Header */}
      <div className="flex items-center gap-4">
        <SkeletonIcon size="lg" />
        <div className="space-y-2">
          <SkeletonLine width="180px" className="h-7" />
          <SkeletonLine width="250px" className="h-3.5" />
        </div>
      </div>

      {/* Warm loading message */}
      <div className="flex items-center gap-2.5">
        <div className="h-2 w-2 rounded-full bg-champagne gentle-pulse" />
        <p className="warm-loading-msg">{message}</p>
      </div>

      {/* Main content card */}
      <SkeletonCard className="p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-5">
          <SkeletonIcon size="sm" />
          <div className="space-y-2 flex-1">
            <SkeletonLine width="45%" className="h-5" />
            <SkeletonLine width="70%" className="h-3" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </SkeletonCard>

      {/* History / list card */}
      <SkeletonCard className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <SkeletonIcon size="sm" />
            <SkeletonLine width="130px" className="h-5" />
          </div>
          <SkeletonBlock className="h-6 w-24 rounded-full" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} className="p-4 bg-[#000000]">
              <div className="flex items-center gap-4">
                <SkeletonCircle size={40} />
                <div className="flex-1 space-y-2">
                  <SkeletonLine width="50%" className="h-3.5" />
                  <SkeletonLine width="80%" className="h-2.5" />
                </div>
              </div>
            </SkeletonCard>
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}

/** Finanzas (riqueza) page skeleton — mirrors the EXACT layout of the non-empty Finanzas page.
 *  No layout shift between skeleton → content. Same structure. Same space.
 *  Contemplative: no flashy shimmer, just quiet reserved space. */
export function FinanzasSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 sm:space-y-12 pb-24 skeleton-entrance">
      {/* Header — matches Gem icon + "Finanzas" + "Cómo fluye tu dinero" */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-champagne/5" />
          <div className="space-y-2">
            <SkeletonLine width="110px" className="h-7 sm:h-8" />
            <SkeletonLine width="160px" className="h-3 sm:h-3.5" />
          </div>
        </div>
      </div>

      {/* Month Navigation — matches the ← month → row */}
      <div className="flex items-center justify-between">
        <div className="w-9 h-9" />
        <div className="flex items-center gap-2">
          <SkeletonLine width="130px" className="h-4 sm:h-4.5" />
        </div>
        <div className="w-9 h-9" />
      </div>

      {/* Balance de Intenciones — matches the card with bars */}
      <SkeletonCard className="p-6 sm:p-8 lg:p-10 rounded-2xl">
        <SkeletonLine width="220px" className="h-3.5 sm:h-4 mb-6 sm:mb-8" />
        <div className="space-y-5 sm:space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <SkeletonLine width={`${55 + i * 10}%`} className="h-3 sm:h-3.5" />
                <SkeletonLine width="65px" className="h-2.5 sm:h-3" />
              </div>
              <div className="h-2 sm:h-2.5 bg-[#111] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-champagne/10"
                  style={{ width: `${30 + i * 20}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </SkeletonCard>

      {/* Saldo neto — matches the big number area */}
      <div className="py-1">
        <SkeletonLine width="160px" className="h-9 sm:h-10 lg:h-12" />
        <div className="flex items-center gap-3 mt-2">
          <SkeletonLine width="110px" className="h-3 sm:h-3.5" />
        </div>
      </div>

      {/* Insight — reserved, quiet */}
      <div className="bg-champagne/3 border border-champagne/10 rounded-2xl p-5 sm:p-6 lg:p-7">
        <SkeletonLine width="80%" className="h-4 sm:h-4.5" />
      </div>

      {/* Historial — matches Movimientos card */}
      <SkeletonCard className="p-5 sm:p-6 lg:p-8 rounded-2xl">
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <SkeletonLine width="120px" className="h-5 sm:h-5.5" />
          <SkeletonLine width="65px" className="h-4" />
        </div>
        <div className="flex gap-2 mb-4">
          {[1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="h-7 w-20 rounded-lg" />
          ))}
        </div>
        <div className="space-y-5">
          {[1, 2].map((group) => (
            <div key={group}>
              <div className="flex items-center justify-between mb-2.5">
                <SkeletonLine width="120px" className="h-2.5" />
                <SkeletonLine width="80px" className="h-2" />
              </div>
              <div className="space-y-2">
                {[1, 2].map((item) => (
                  <div key={item} className="flex items-center gap-3 bg-[#000000] border border-[#1a1a1a] rounded-lg p-3 sm:p-4">
                    <div className="w-1 h-8 rounded-full bg-[#1a1a1a]" />
                    <div className="flex-1 space-y-1.5">
                      <SkeletonLine width="40%" className="h-3.5" />
                      <SkeletonLine width="60%" className="h-2.5" />
                    </div>
                    <SkeletonLine width="60px" className="h-3.5" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}

/** Weekly Recap skeleton — replaces inline skeleton in WeeklyRecap component */
export function WeeklyRecapSkeleton() {
  return (
    <div className="skeleton-entrance">
      <SkeletonCard className="overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 sm:px-7 sm:pt-7 sm:pb-5 border-b border-[#1a1a1a]/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <SkeletonIcon size="sm" />
              <div className="space-y-1.5 sm:space-y-2">
                <SkeletonLine width="130px" className="h-4 sm:h-5" />
                <SkeletonLine width="80px" className="h-2 sm:h-2.5" />
              </div>
            </div>
            <SkeletonLine width="80px" className="h-2.5 sm:h-3" />
          </div>
        </div>
        {/* Body */}
        <div className="p-3 sm:p-7 space-y-4 sm:space-y-7">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
            {/* Score placeholder */}
            <SkeletonCard className="p-3 sm:p-6 bg-[#000000]">
              <div className="flex items-center gap-3 sm:gap-6">
                <SkeletonCircle size={64} className="shrink-0 sm:size-[96px]" />
                <div className="flex-1 space-y-1.5 sm:space-y-2">
                  <SkeletonLine width="55%" className="h-3 sm:h-4" />
                  <SkeletonLine width="40%" className="h-4 sm:h-5" />
                  <SkeletonLine width="65%" className="h-2.5 sm:h-3" />
                </div>
              </div>
            </SkeletonCard>
            {/* Emotional state placeholder */}
            <SkeletonCard className="p-3 sm:p-6 bg-[#000000]">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <SkeletonCircle size={12} />
                  <SkeletonLine width="100px" className="h-3 sm:h-4" />
                </div>
                <SkeletonBlock className="h-4 sm:h-5 w-16 sm:w-20 rounded-full" />
              </div>
              <SkeletonLine width="80%" className="h-2.5 sm:h-3 mb-2 sm:mb-4" />
              <div className="space-y-2 sm:space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-2 sm:gap-3">
                    <SkeletonCircle size={10} />
                    <SkeletonLine width="3rem" className="h-2 sm:h-2.5 shrink-0" />
                    <SkeletonBar width="100%" height="0.25rem" className="rounded-full flex-1 sm:h-[0.375rem]" />
                    <SkeletonLine width="1.25rem" className="h-2 sm:h-2.5 shrink-0" />
                  </div>
                ))}
              </div>
            </SkeletonCard>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
            <SkeletonCard className="p-3 sm:p-6 bg-[#000000]">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-5">
                <SkeletonCircle size={12} />
                <SkeletonLine width="120px" className="h-3 sm:h-4" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonBlock key={i} className="h-14 sm:h-16 rounded-lg" />
                ))}
              </div>
            </SkeletonCard>
            <SkeletonCard className="p-3 sm:p-6 bg-[#000000]">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-5">
                <SkeletonCircle size={12} />
                <SkeletonLine width="140px" className="h-3 sm:h-4" />
              </div>
              <div className="space-y-2 sm:space-y-3">
                {[1, 2, 3].map((i) => (
                  <SkeletonBlock key={i} className="h-12 sm:h-14 rounded-lg" />
                ))}
              </div>
            </SkeletonCard>
          </div>
        </div>
      </SkeletonCard>
    </div>
  );
}
