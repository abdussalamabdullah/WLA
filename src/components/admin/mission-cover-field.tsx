"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { discardCoverUploadAction, registerCoverUploadAction } from "@/features/admin/cover-actions";
import { MAX_IMAGE_BYTES, sniffImage } from "@/features/journal/media";
import { prepareImage, uploadToStorage } from "@/features/journal/upload-client";
import { COVER_BUCKET, coverSrc } from "@/features/missions/covers";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

const COVER_MIME = ["image/png", "image/jpeg", "image/webp"];
const TYPE_MESSAGE = "Use a PNG, JPEG or WebP image.";

function describeFailure(status: number, body: string): string {
  if (status === 413 || /maximum allowed size|exceeded|too large/i.test(body)) return "That image is larger than 10 MB.";
  if (status === 415 || /mime type|not supported/i.test(body)) return TYPE_MESSAGE;
  if (status === 401 || status === 403 || /row-level security|unauthori[sz]ed|jwt/i.test(body)) {
    return "You can't add a cover, or your session has expired. Reload the page and try again.";
  }
  return "The image couldn't be uploaded. Try again.";
}

function randomStem(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The mission's cover: choose, preview, replace, remove (D-146).
 *
 * It holds one hidden field, `cover_image`, so the mission form's own Save and
 * unsaved-changes protection cover it like any other field. The file is uploaded
 * when chosen, so the preview is the real stored image, but the mission doesn't
 * change until Save. An upload that is replaced or removed first is deleted.
 */
export function MissionCoverField({
  missionId,
  savedValue,
  error,
  onBusyChange,
}: {
  missionId: string;
  savedValue: string | null;
  error?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [value, setValue] = useState(savedValue ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  // A programmatic value change fires no event, and the form's dirty check needs one.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    hidden.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [value]);

  function setWorking(next: boolean) {
    setBusy(next);
    onBusyChange?.(next);
  }

  /** The current value, if it's an upload that was never saved, is now unwanted. */
  function discardUnsaved() {
    if (value && value !== savedValue) void discardCoverUploadAction(missionId, value).catch(() => {});
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProblem(null);
    setWorking(true);
    try {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const type = sniffImage(head);
      if (!type || !COVER_MIME.includes(type.mime)) return setProblem(TYPE_MESSAGE);
      if (file.size === 0) return setProblem("That file is empty.");

      const prepared = await prepareImage(file, type);
      if ("error" in prepared) return setProblem(prepared.error);
      if (prepared.blob.size > MAX_IMAGE_BYTES) return setProblem("That image is larger than 10 MB.");

      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) return setProblem("Your session has expired. Reload the page, sign in, and try again.");

      const objectName = `${missionId}/${randomStem()}.${prepared.type.ext}`;
      await uploadToStorage({
        supabaseUrl: publicEnv.supabaseUrl,
        anonKey: publicEnv.supabaseAnonKey,
        accessToken: token,
        path: objectName,
        blob: prepared.blob,
        contentType: prepared.type.mime,
        bucket: COVER_BUCKET,
        describeFailure,
      });

      const registered = await registerCoverUploadAction(missionId, objectName);
      if ("error" in registered) return setProblem(registered.error);
      discardUnsaved();
      setValue(registered.value);
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "The image couldn't be uploaded. Try again.");
    } finally {
      setWorking(false);
    }
  }

  function onRemove() {
    discardUnsaved();
    setProblem(null);
    setValue("");
  }

  const src = coverSrc(value);
  const unsaved = value !== (savedValue ?? "");

  return (
    <section className="flex flex-col gap-[var(--space-m)]">
      <h2 className="text-[length:var(--text-h3)]">Cover image</h2>
      <p className="wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        PNG, JPEG or WebP, up to 10 MB. Large photos are resized for you. Covers aren&rsquo;t versioned: once you
        save, the new image appears straight away wherever this mission is shown.
      </p>

      <input ref={hidden} type="hidden" name="cover_image" value={value} />
      <input
        ref={picker}
        type="file"
        accept={COVER_MIME.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label="Cover image file"
        onChange={onPick}
      />

      <FormError message={problem ?? error} />

      {src ? (
        // A plain img: a preview at whatever address the stored value resolves to.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Preview of the cover image"
          className="aspect-[4/3] w-full max-w-[24rem] rounded-[var(--radius-card)] border border-[var(--color-border)] object-cover"
        />
      ) : (
        <p className="text-[length:var(--text-small)]">No cover image yet.</p>
      )}

      <div className="flex flex-wrap items-center gap-[var(--space-s)]">
        <Button type="button" variant="secondary" isLoading={busy} loadingLabel="Uploading…" onClick={() => picker.current?.click()}>
          {value ? "Replace image" : "Choose image"}
        </Button>
        {value && !busy && (
          <Button type="button" variant="text" onClick={onRemove}>
            Remove image
          </Button>
        )}
        <span role="status" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {unsaved && !busy ? (value ? "Not saved yet. Press Save changes to use this image." : "Not saved yet. Press Save changes to remove the image.") : ""}
        </span>
      </div>
    </section>
  );
}
