-- AlterTable: remove the dead "level" column from "EmpireProgress"
--
-- N-4 audit found that "level" was written only by its column default
-- (never set by any createMany/upsert/update/raw SQL) and never read:
-- every consumer derives the level from XP at read time with
-- level = Math.floor(xp / 100) + 1
-- (GET /api/empire, src/lib/mentor-context.ts, src/lib/achievements.ts).
-- Dropping it changes no behavior; XP and streak stay untouched.

ALTER TABLE "EmpireProgress" DROP COLUMN "level";
