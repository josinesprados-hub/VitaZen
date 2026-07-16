path = '/home/z/my-project/VitaZen/prisma/schema.prisma'
content = open(path).read()

# Fix: Remove duplicate User indexes if the script added them multiple times
while content.count('  @@index([weeklyEmailSummary, emailVerified]) // PERF-5.2') > 1:
    content = content.replace('  @@index([weeklyEmailSummary, emailVerified]) // PERF-5.2: for weekly email batch cron\n  @@index([dailyReminders]) // PERF-5.2: for daily notification batch cron\n  @@index([weeklyEmailSummary, emailVerified]) // PERF-5.2', '  @@index([weeklyEmailSummary, emailVerified]) // PERF-5.2', 1)

# Check remaining missing indexes
remaining = []

if '@@index([userId, active])\n  @@index([token])' in content:
    remaining.append('PushToken redundant index')

if '@@index([userId])\n}\n\n// ═══════════════════════════════════════\n// WEEKLY EMAIL' in content:
    remaining.append('EmotionalDashboardState redundant index')

if '@@index([empire, plan])' not in content:
    remaining.append('EmpireTip [empire, plan]')

if '@@index([userId]) // PERF-5.2: FK lookup' not in content:
    remaining.append('Subscription [userId]')

if '@@index([userId, completed, completedAt])' not in content:
    remaining.append('UserChallenge [userId, completed, completedAt]')

if remaining:
    print(f'Still missing {len(remaining)} indexes:')
    for r in remaining:
        print(f'  ❌ {r}')
else:
    print('All indexes applied correctly!')

# Verify no duplicates
import re
all_indexes = re.findall(r'@@index\(\[([^\]]+)\]\)', content)
from collections import Counter
dupes = {k: v for k, v in Counter(all_indexes).items() if v > 1}
if dupes:
    print(f'\n⚠️ Duplicate indexes found: {dupes}')
else:
    print('No duplicate indexes')

open(path, 'w').write(content)
print(f'\nTotal indexes: {len(all_indexes)}')