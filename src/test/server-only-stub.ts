/**
 * Test stub for Next.js's `server-only` package.
 *
 * `server-only` exists to make importing a server module from a Client
 * Component a build error. It has no runtime behaviour, and Vitest cannot
 * resolve it, so vitest.config.mts aliases it here.
 *
 * This does NOT weaken the guarantee. `next build` still enforces it, and the
 * structural tests in lib/permissions assert that each server-only module
 * declares the import.
 */
export {};
