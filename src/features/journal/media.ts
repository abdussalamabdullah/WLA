/**
 * JOURNAL IMAGE RULES. Raster images only — PNG, JPEG, WebP, GIF — up to
 * 10 MB, identified by their first bytes rather than the name or the
 * browser's claimed type. SVG is refused: it can carry script. The database
 * repeats the type and size limits (journal_media check constraints).
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * The largest file an author may PICK (D-135). Photos above the stored limit
 * are resized in the browser before upload (upload-client.ts); whatever is
 * uploaded must still be within MAX_IMAGE_BYTES, which the bucket, the
 * database and the server each enforce again.
 */
export const MAX_SOURCE_IMAGE_BYTES = 30 * 1024 * 1024;

/** The raster allowlist, as MIME types (bucket allowed_mime_types matches). */
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export type ImageType = { mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; ext: string };

export function sniffImage(bytes: Uint8Array): ImageType | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { mime: "image/png", ext: "png" };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) {
    return { mime: "image/gif", ext: "gif" };
  }
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export function imageProblem(bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0) return "The file is empty.";
  if (bytes.byteLength > MAX_IMAGE_BYTES) return "Images must be 10 MB or smaller.";
  if (!sniffImage(bytes)) return "Use a PNG, JPEG, WebP or GIF image.";
  return null;
}

/**
 * Where an article's file goes. Always inside the article's own folder — the
 * storage policy and journal_register_media both refuse anything else.
 */
/** Is this storage path one this article's uploads may use (`<article>/<safe-name>.<ext>`)? */
export function isArticleMediaPath(articleId: string, path: string): boolean {
  return new RegExp(`^${articleId.replace(/[^0-9a-f-]/gi, "")}/[a-z0-9-]{1,60}\\.(png|jpg|webp|gif)$`).test(path);
}

export function mediaPath(articleId: string, stem: string, ext: string): string {
  const safe = stem.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "image";
  return `${articleId}/${safe}.${ext}`;
}

/** Hosts Medium serves post images from. Nothing else is fetched (no SSRF). */
const MEDIUM_IMAGE_HOSTS = new Set(["cdn-images-1.medium.com", "miro.medium.com"]);

export function isMediumImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && MEDIUM_IMAGE_HOSTS.has(u.hostname) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

/**
 * Download one Medium image: https, allowlisted hosts only (also across
 * redirects), a timeout, and a hard size cap while reading.
 */
export async function fetchMediumImage(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; type: ImageType } | { error: string }> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isMediumImageUrl(current)) return { error: "it isn't hosted on Medium's image servers" };
    let res: Response;
    try {
      res = await fetchImpl(current, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    } catch {
      return { error: "it couldn't be downloaded (network error or timeout)" };
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return { error: "Medium redirected without a destination" };
      current = new URL(next, current).toString();
      continue;
    }
    if (!res.ok || !res.body) return { error: `Medium answered ${res.status}` };
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_IMAGE_BYTES) return { error: "it is larger than 10 MB" };

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return { error: "it is larger than 10 MB" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.byteLength;
    }
    const type = sniffImage(bytes);
    if (!type) return { error: "it isn't a PNG, JPEG, WebP or GIF image" };
    return { bytes, type };
  }
  return { error: "too many redirects" };
}
