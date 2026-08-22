-- AlterTable: remove dead fields that have no functional consumers

ALTER TABLE "NotificationPreference" DROP COLUMN "streakReminders";

ALTER TABLE "EmotionalDashboardState" DROP COLUMN "reflectionState";

ALTER TABLE "EmotionalDashboardState" DROP COLUMN "tipsState";
