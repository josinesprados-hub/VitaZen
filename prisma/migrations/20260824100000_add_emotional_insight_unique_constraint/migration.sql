-- CreateIndex: C-01 TOCTOU fix — prevent duplicate EmotionalInsight per user/category/insight
-- Safe: EmotionalInsight has 0 rows, no duplicate conflicts possible.

CREATE UNIQUE INDEX "EmotionalInsight_userId_category_insight_key" ON "EmotionalInsight"("userId", "category", "insight");
