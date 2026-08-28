-- CreateTable
CREATE TABLE "DeferredNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeferredNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeferredNotification_status_scheduledFor_idx" ON "DeferredNotification"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "DeferredNotification_userId_status_idx" ON "DeferredNotification"("userId", "status");

-- CreateIndex
CREATE INDEX "DeferredNotification_createdAt_idx" ON "DeferredNotification"("createdAt");

-- AddForeignKey
ALTER TABLE "DeferredNotification" ADD CONSTRAINT "DeferredNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
