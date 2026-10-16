/**
 * Medium import sizes, shared by the browser and the server.
 *
 * One import REQUEST's body stays below the app proxy's 10 MB buffer (Next's
 * proxyClientMaxBodySize), so it is never silently truncated. A larger export
 * is reduced to its posts/*.html in the browser before it is sent.
 */
export const IMPORT_BODY_LIMIT = 9.5 * 1024 * 1024;
/** Matches medium.ts: the most one export may be before anything is read. */
export const MAX_EXPORT_PICK_BYTES = 200 * 1024 * 1024;
