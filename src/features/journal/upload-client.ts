"use client";

import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES, MAX_SOURCE_IMAGE_BYTES, mediaPath, sniffImage, type ImageType } from "./media";

/**
 * INLINE IMAGE UPLOADS, browser side (D-135).
 *
 * The file goes straight from the author's browser to the private
 * `journal-media` bucket with the author's OWN session — not through a
 * server action (1 MB limit) or the app's proxy (10 MB buffer). Storage
 * accepts it only into an article the author can edit (RLS) and only within
 * the bucket's 10 MB / raster allowlist. The server then checks the actual
 * bytes before the image is registered (registerUploadAction). So the checks
 * here are for a quick, clear answer, not the defence.
 */

export const RESIZE_LONGEST_EDGE = 2400;
/** Above this, a still image is re-encoded even if it is small enough in pixels. */
const RECOMPRESS_ABOVE_BYTES = 3 * 1024 * 1024;

export type PreparedImage = { blob: Blob; type: ImageType; resized: boolean };

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/** First answer, before any upload: type by content, and size. */
export async function checkPickedImage(file: File): Promise<{ type: ImageType } | { error: string }> {
  if (file.size === 0) return { error: "That file is empty." };
  if (file.size > MAX_SOURCE_IMAGE_BYTES) return { error: `That image is ${mb(file.size)}. Choose one under ${mb(MAX_SOURCE_IMAGE_BYTES)}.` };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = sniffImage(head);
  if (!type) return { error: "Use a PNG, JPEG, WebP or GIF image." };
  if (type.mime === "image/gif" && file.size > MAX_IMAGE_BYTES) {
    return { error: `Animated GIFs can't be made smaller here, and this one is ${mb(file.size)}. Use one under 10 MB.` };
  }
  return { type };
}

/**
 * Large photos are scaled to at most 2400 px on the longest edge and
 * re-encoded (JPEG stays JPEG; PNG and WebP become WebP, which keeps
 * transparency). GIFs are left alone so animation survives. The original is
 * kept whenever re-encoding would not make it smaller.
 */
export async function prepareImage(file: File, type: ImageType): Promise<PreparedImage | { error: string }> {
  if (type.mime === "image/gif") return { blob: file, type, resized: false };
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file.size <= MAX_IMAGE_BYTES ? { blob: file, type, resized: false } : { error: "That image couldn't be read. Try saving it again as a JPEG." };
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= RESIZE_LONGEST_EDGE && file.size <= RECOMPRESS_ABOVE_BYTES) {
    bitmap.close();
    return { blob: file, type, resized: false };
  }
  const scale = Math.min(1, RESIZE_LONGEST_EDGE / longest);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file.size <= MAX_IMAGE_BYTES ? { blob: file, type, resized: false } : { error: "This browser couldn't resize the image. Choose one under 10 MB." };
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const outMime = type.mime === "image/jpeg" ? "image/jpeg" : "image/webp";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outMime, 0.86));
  if (!blob) return file.size <= MAX_IMAGE_BYTES ? { blob: file, type, resized: false } : { error: "The image couldn't be resized. Choose one under 10 MB." };
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const outType = sniffImage(head);
  // A browser that silently produced PNG (no WebP encoder) is still fine if it is smaller.
  if (!outType || blob.size >= file.size) {
    return file.size <= MAX_IMAGE_BYTES ? { blob: file, type, resized: false } : { error: `Even resized, this image is too large. Choose one under 10 MB.` };
  }
  if (blob.size > MAX_IMAGE_BYTES) return { error: "Even resized, this image is larger than 10 MB." };
  return { blob, type: outType, resized: true };
}

/** A fresh storage path inside the article's folder (the only place RLS allows). */
export function newUploadPath(articleId: string, fileName: string, ext: string): string {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
  return mediaPath(articleId, `${Date.now().toString(36)}-${random}-${fileName.replace(/\.[^.]+$/, "")}`, ext);
}

export class UploadError extends Error {}

/**
 * PUT the bytes into the private bucket with the author's own access token,
 * reporting progress. Never overwrites (x-upsert: false).
 */
export function uploadToStorage(opts: {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  path: string;
  blob: Blob;
  contentType: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Journal media by default. Mission covers use their own bucket (D-146). */
  bucket?: string;
  describeFailure?: (status: number, body: string) => string;
}): Promise<void> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(opts.contentType)) {
    return Promise.reject(new UploadError("Use a PNG, JPEG, WebP or GIF image."));
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const encoded = opts.path.split("/").map(encodeURIComponent).join("/");
    xhr.open("POST", `${opts.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/${opts.bucket ?? "journal-media"}/${encoded}`);
    xhr.setRequestHeader("Authorization", `Bearer ${opts.accessToken}`);
    xhr.setRequestHeader("apikey", opts.anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", opts.contentType);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(new UploadError((opts.describeFailure ?? uploadFailureMessage)(xhr.status, xhr.responseText)));
    };
    xhr.onerror = () => reject(new UploadError("The upload was interrupted. Check your connection and try again."));
    xhr.onabort = () => reject(new UploadError("Upload cancelled."));
    opts.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(opts.blob);
  });
}

export function uploadFailureMessage(status: number, body: string): string {
  if (status === 413 || /payload too large|maximum allowed size|exceeded/i.test(body)) return "That image is larger than 10 MB.";
  if (status === 415 || /mime type|not supported/i.test(body)) return "Use a PNG, JPEG, WebP or GIF image.";
  if (status === 401 || status === 403 || /row-level security|unauthori[sz]ed|jwt/i.test(body)) {
    return "You can't add images to this article, or your session has expired. Reload the page and try again.";
  }
  if (status === 0) return "The upload was interrupted. Check your connection and try again.";
  return "The image couldn't be uploaded. Try again.";
}
