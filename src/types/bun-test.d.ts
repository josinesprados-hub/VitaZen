/**
 * TYPE-ONLY bridge - no runtime effect.
 *
 * The notification scheduler tests (src/lib/notifications/__tests__/
 * prod01-defer-and-recover.test.ts and scheduler.test.ts) run under the Bun
 * runtime ("bun test") and import from 'bun:test'. TypeScript could not
 * resolve that specifier because "bun-types" is not an @types scoped package,
 * so it is not auto-included by tsconfig (which intentionally has no "types"
 * array - adding one would change the automatic @types inclusion).
 *
 * This triple-slash reference loads the official "bun-types" package (already
 * a devDependency), which declares the "bun:test" module among others. The
 * file is picked up by the tsconfig include globs and has no runtime effect.
 */
/// <reference types="bun-types" />
