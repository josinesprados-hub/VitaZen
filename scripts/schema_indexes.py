import re

path = '/home/z/my-project/VitaZen/prisma/schema.prisma'
content = open(path).read()

changes = []

# 1. Remove redundant PushToken @@index([token]) (token is @unique)
old = '  @@index([userId, active])\n  @@index([token])\n}'
new = '  @@index([userId, active])\n}'
if old in content:
    content = content.replace(old, new, 1)
    changes.append('Removed redundant PushToken @@index([token])')

# 2. Remove redundant EmotionalDashboardState @@index([userId]) (userId is @unique)
old = '  @@index([userId])\n}\n\n// ═══════════════════════════════════════\n// WEEKLY EMAIL'
new = '}\n\n// ═══════════════════════════════════════\n// WEEKLY EMAIL'
if old in content:
    content = content.replace(old, new, 1)
    changes.append('Removed redundant EmotionalDashboardState @@index([userId])')

# 3. Add UserChallenge @@index([userId, completed, completedAt])
old = '  @@unique([userId, date])\n}\n\n// ═══════════════════════════════════════\n// WELLNESS'
new = '  @@unique([userId, date])\n  @@index([userId, completed, completedAt])\n}\n\n// ═══════════════════════════════════════\n// WELLNESS'
if old in content:
    content = content.replace(old, new, 1)
    changes.append('Added UserChallenge @@index([userId, completed, completedAt])')

# 4. Add HabitLog @@index([userId, streak])
old = '  @@index([userId, lastCompletedAt]) // GLOBAL-18: composite for dashboard/streaks queries\n}'
new = '  @@index([userId, lastCompletedAt]) // GLOBAL-18: composite for dashboard/streaks queries\n  @@index([userId, streak]) // PERF-5.2: composite for insights/recap streak ordering\n}'
if old in content:
    content = content.replace(old, new, 1)
    changes.append('Added HabitLog @@index([userId, streak])')

# 5. Add AnalyticsEvent @@index([userId, event, createdAt])
old = '  @@index([event, createdAt])\n  @@index([userId, createdAt])\n}'
new = '  @@index([event, createdAt])\n  @@index([userId, createdAt])\n  @@index([userId, event, createdAt]) // PERF-5.2: composite for daily_session dedup\n}'
if old in content:
    content = content.replace(old, new, 1)
    changes.append('Added AnalyticsEvent @@index([userId, event, createdAt])')

# 6. Add WidgetSnapshot indexes
old = '  @@index([userId, widgetType, expiresAt])\n  @@map("widget_snapshots")\n}'
new = '  @@index([userId, widgetType, expiresAt])\n  @@index([expiresAt]) // PERF-5.2: for batch refresh cron\n  @@index([userId, computedAt]) // PERF-5.2: for rate limiting\n  @@map("widget_snapshots")\n}'
if old in content:
    content = content.replace(old, new, 1)
    changes.append('Added WidgetSnapshot @@index([expiresAt]) and @@index([userId, computedAt])')

# 7. Add EmpireTip @@index([empire, plan])
old = '  createdAt DateTime @default(now())\n}\n\n// ═══════════════════════════════════════\n// ACHIEVEMENTS'
new = '  createdAt DateTime @default(now())\n\n  @@index([empire, plan]) // PERF-5.2: for tips API and widget shaping queries\n}\n\n// ═══════════════════════════════════════\n// ACHIEVEMENTS'
if old in content:
    content = content.replace(old, new, 1)
    changes.append('Added EmpireTip @@index([empire, plan])')

# 8. Add Subscription @@index([userId])
old = '  user User @relation(fields: [userId], references: [id], onDelete: Cascade)\n}\n\n// ═══════════════════════════════════════\n// AI SYSTEM'
new = '  user User @relation(fields: [userId], references: [id], onDelete: Cascade)\n\n  @@index([userId]) // PERF-5.2: FK lookup for User->Subscription\n}\n\n// ═══════════════════════════════════════\n// AI SYSTEM'
if old in content:
    content = content.replace(old, new, 1)
    changes.append('Added Subscription @@index([userId])')

# 9. Add User batch cron indexes
old = '  onboardingData    OnboardingData?\n  pushTokens        PushToken[]'
new = '  onboardingData    OnboardingData?\n  pushTokens        PushToken[]\n\n  @@index([weeklyEmailSummary, emailVerified]) // PERF-5.2: for weekly email batch cron\n  @@index([dailyReminders]) // PERF-5.2: for daily notification batch cron'
if old in content:
    content = content.replace(old, new, 1)
    changes.append('Added User @@index([weeklyEmailSummary, emailVerified]) and @@index([dailyReminders])')

open(path, 'w').write(content)

print(f'Applied {len(changes)} changes:')
for c in changes:
    print(f'  ✅ {c}')