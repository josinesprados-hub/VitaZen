// ═══════════════════════════════════════════
// BATCH KEYSET PAGINATION — VitaZen
// N-04 (FASE 18): stable traversal of ALL
// eligible users in batch processes.
//
// Problem: batch selectors used fixed `take`
// (100/500) with no `orderBy` and no cursor.
// Once the eligible population exceeded the
// limit, an arbitrary (but effectively stable)
// subset was returned on every run while users
// beyond the limit were never processed.
//
// Fix: keyset (cursor) pagination over a unique,
// stable field (User.id / NotificationPreference.userId).
// Each run walks every page until exhausted.
//
// Why keyset over OFFSET/skip:
//  - O(log n) seek instead of O(n) scan per page;
//  - no row is visited twice within a run
//    (strictly ascending key with skip: 1);
//  - stable and deterministic ordering;
//  - safe under concurrent inserts (a new row
//    after the cursor is picked up next page,
//    never re-processed).
//
// Contract for fetchPage implementations:
//  - orderBy: { <key>: 'asc' } (unique field)
//  - cursor:  { <key>: cursor } when cursor != null
//  - skip: 1 when a cursor is present (exclude the
//    cursor row itself from the next page)
//  - take: pageSize
// ═══════════════════════════════════════════

export interface KeysetBatchResult {
  /** Number of pages fetched (including the final empty/partial one). */
  pages: number;
  /** Total items handed to processPage. */
  processed: number;
}

export interface KeysetBatchOptions<T> {
  /** Label used in logs/errors, e.g. "checkin-reminder". */
  label: string;
  /** Page size — matches the previous `take` to keep per-page DB/memory profile unchanged. */
  pageSize: number;
  /**
   * Absolute safety net against endless loops (e.g. a data store that
   * ignores the cursor). Default 10_000 pages. When reached, the batch
   * THROWS so the cron endpoint records a failure instead of silently
   * dropping users.
   */
  maxPages?: number;
  /**
   * Fetch one page starting strictly AFTER `cursor`
   * (null for the first page). Must implement the keyset
   * contract documented at the top of this file.
   */
  fetchPage: (cursor: string | null) => Promise<T[]>;
  /** Extract the unique cursor key from an item (same field used in cursor/orderBy). */
  getKey: (item: T) => string;
  /** Process one page of items. Called in ascending key order. */
  processPage: (page: T[]) => Promise<void>;
}

/**
 * Walk ALL pages of a keyset-ordered query, processing each page as it
 * is fetched (constant memory: never more than one page in scope).
 *
 * Termination: stops when a page comes back empty or shorter than
 * pageSize (last partial page is still processed before stopping).
 *
 * Anti-stall guard: with `orderBy asc + cursor + skip: 1` the first key
 * of every non-empty page must be strictly greater than the previous
 * cursor. If it is not, the data store violated the keyset contract and
 * the batch throws instead of spinning forever.
 */
export async function runKeysetBatch<T>(options: KeysetBatchOptions<T>): Promise<KeysetBatchResult> {
  const { label, pageSize, fetchPage, getKey, processPage } = options;
  const maxPages = options.maxPages ?? 10_000;

  let cursor: string | null = null;
  let pages = 0;
  let processed = 0;

  while (true) {
    if (pages >= maxPages) {
      throw new Error(
        `[N-04:${label}] keyset batch exceeded maxPages (${maxPages}) — aborting to avoid an endless loop`
      );
    }

    const page = await fetchPage(cursor);
    pages++;

    if (page.length === 0) break;

    // Keyset contract: ascending unique key, cursor row excluded.
    if (cursor !== null && getKey(page[0]) <= cursor) {
      throw new Error(
        `[N-04:${label}] keyset cursor did not advance (first key "${getKey(page[0])}" <= cursor "${cursor}") — aborting`
      );
    }

    await processPage(page);
    processed += page.length;

    if (page.length < pageSize) break;
    cursor = getKey(page[page.length - 1]);
  }

  return { pages, processed };
}
