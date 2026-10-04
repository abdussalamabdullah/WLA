"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useMissionContext } from "@/components/mission/mission-context";
import { PrimaryAction, ScreenFrame } from "./shared";
import { parseScreenConfig, type ScreenComponentProps } from "@/features/mission-engine";
import { cn } from "@/lib/utils";

/**
 * DEVICE-ASSISTED MISSION INPUT (Enhancement Plan §5).
 *
 * Camera: object-facing only — the REAR camera, framed and worded as
 * "point at the card", never a selfie view. Frames are read in memory by the
 * browser's own BarcodeDetector and dropped; nothing is captured, kept or
 * sent. The camera stops the moment a code is read, the child leaves, or
 * they choose to type instead.
 *
 * Sensors: compass heading, tilt and shakes are read as numbers. iOS needs a
 * tap to grant motion access; it is asked for only when the child chooses to
 * use the sensor.
 *
 * Every device route has an equivalent manual route on the same screen, and
 * using it is reported only as `device_fallback_used` (D-76: structural).
 */

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** "Scan it" for code entry: fills the field with what the camera reads. */
export function CameraScan({ onRead }: { onRead: (text: string) => void }) {
  const ctx = useMissionContext();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "starting" | "scanning" | "unavailable" | "denied">("idle");

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => stop, []);

  async function start() {
    const BD = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!BD || !navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      ctx.report("device_fallback_used", { source: "camera_unavailable" });
      return;
    }
    setState("starting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch {
      setState("denied");
      ctx.report("device_fallback_used", { source: "camera_denied" });
      return;
    }
    const v = video.current!;
    v.srcObject = stream.current;
    await v.play().catch(() => {});
    setState("scanning");
    const detector = new BD({ formats: ["qr_code", "code_128", "ean_13", "code_39"] });
    const tick = async () => {
      if (!stream.current) return;
      try {
        const found = await detector.detect(v);
        if (found[0]?.rawValue) {
          stop();
          setState("idle");
          onRead(found[0].rawValue);
          return;
        }
      } catch { /* a frame that could not be read */ }
      setTimeout(tick, 300);
    };
    tick();
  }

  return (
    <div className="flex flex-col gap-[var(--space-s)]">
      {state === "scanning" || state === "starting" ? (
        <>
          <p className="wla-measure text-[length:var(--text-small)]">Point the camera at the code on the card — just the card, not people or faces.</p>
          <video ref={video} muted playsInline aria-label="Camera view of the card being scanned" className="aspect-[4/3] w-full max-w-[22rem] rounded-[var(--radius-surface)] bg-[var(--color-surface-raised)] object-cover" />
          <div><Button type="button" variant="text" onClick={() => { stop(); setState("idle"); }}>Stop the camera</Button></div>
        </>
      ) : (
        <>
          <video ref={video} hidden muted playsInline />
          <div><Button type="button" variant="secondary" onClick={start}>Scan it with the camera</Button></div>
          {state === "unavailable" && <p className="text-[length:var(--text-small)]">This device can&rsquo;t scan codes. Type it in instead — it works just the same.</p>}
          {state === "denied" && <p className="text-[length:var(--text-small)]">The camera isn&rsquo;t available. Type it in instead — it works just the same.</p>}
        </>
      )}
    </div>
  );
}

const DIRECTIONS = [
  { id: "0", label: "North" }, { id: "45", label: "North-east" }, { id: "90", label: "East" }, { id: "135", label: "South-east" },
  { id: "180", label: "South" }, { id: "225", label: "South-west" }, { id: "270", label: "West" }, { id: "315", label: "North-west" },
];
const compassWord = (deg: number) => DIRECTIONS[Math.round(deg / 45) % 8].label;

type OrientationEventCtor = { requestPermission?: () => Promise<"granted" | "denied"> };

export function DeviceInputScreen(p: ScreenComponentProps) {
  const c = parseScreenConfig("device_input", p.screen.configuration);
  const ctx = useMissionContext();
  const [reading, setReading] = useState<number | null>(null);
  const [sensor, setSensor] = useState<"off" | "on" | "unavailable" | "denied">("off");
  const [manual, setManual] = useState(false);
  const [manualValue, setManualValue] = useState<string>("");
  const shakes = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    if (sensor !== "on") return;
    const onOrient = (e: DeviceOrientationEvent) => {
      const heading = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading ?? (e.alpha !== null ? (360 - e.alpha) % 360 : null);
      if (c.mode === "compass" && heading !== null) setReading(Math.round(heading) % 360);
      if (c.mode === "tilt" && e.beta !== null) setReading(Math.max(-90, Math.min(90, Math.round(e.beta))));
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
      const now = Date.now();
      if (mag > 22 && now - last.current > 400) {
        last.current = now;
        shakes.current = Math.min(100, shakes.current + 1);
        setReading(shakes.current);
      }
    };
    if (c.mode === "motion") window.addEventListener("devicemotion", onMotion);
    else window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, [sensor, c.mode]);

  async function useSensor() {
    const Ctor = (c.mode === "motion" ? globalThis.DeviceMotionEvent : globalThis.DeviceOrientationEvent) as unknown as OrientationEventCtor | undefined;
    if (!Ctor) { setSensor("unavailable"); setManual(true); ctx.report("device_fallback_used", { source: `${c.mode}_unavailable` }); return; }
    if (typeof Ctor.requestPermission === "function") {
      const r = await Ctor.requestPermission().catch(() => "denied" as const);
      if (r !== "granted") { setSensor("denied"); setManual(true); ctx.report("device_fallback_used", { source: `${c.mode}_denied` }); return; }
    }
    shakes.current = 0;
    setReading(null);
    setSensor("on");
  }

  const manualReading = c.mode === "motion" ? (manualValue === "done" ? c.target : null) : manualValue === "" ? null : Number(manualValue);
  const value = manual ? manualReading : reading;
  const described = value === null ? "" : c.mode === "compass" ? `${value}° — ${compassWord(value)}` : c.mode === "tilt" ? `${value}°` : `${value} shake${value === 1 ? "" : "s"}`;

  return (
    <ScreenFrame
      title={p.screen.title}
      body={p.screen.body}
      instruction={c.instruction}
      missionControl={c.missionControl}
      error={p.error}
      action={
        <PrimaryAction label={c.actionLabel ?? "Use this"} isPending={p.isPending} disabled={value === null || !Number.isFinite(value)}
          onClick={() => p.onAdvance({ kind: "submit", screenKey: p.screen.screenKey, value: { reading: value, source: manual ? "manual" : "sensor" } })} />
      }
    >
      <p className="wla-measure font-medium">{c.prompt}</p>
      <p className="wla-measure">{c.label}</p>

      {!manual && (
        <div className="flex flex-col gap-[var(--space-s)]">
          {sensor !== "on" ? (
            <div><Button type="button" variant="secondary" onClick={useSensor}>
              {c.mode === "compass" ? "Use the compass" : c.mode === "tilt" ? "Use the tilt sensor" : "Count my shakes"}
            </Button></div>
          ) : (
            <p aria-live="polite" className="text-[length:var(--text-h3)] tabular-nums">
              {value === null ? (c.mode === "motion" ? `Shake ${c.target} times.` : "Move your device slowly…") : described}
            </p>
          )}
          <div><Button type="button" variant="text" onClick={() => { setManual(true); ctx.report("device_fallback_used", { source: `${c.mode}_chosen` }); }}>
            Do it without the {c.mode === "motion" ? "sensor" : c.mode === "compass" ? "compass" : "sensor"}
          </Button></div>
        </div>
      )}

      {manual && (
        <div className="flex flex-col gap-[var(--space-s)]">
          {sensor === "unavailable" && <p className="text-[length:var(--text-small)]">This device doesn&rsquo;t have that sensor — this way works just the same.</p>}
          {sensor === "denied" && <p className="text-[length:var(--text-small)]">The sensor isn&rsquo;t available — this way works just the same.</p>}
          {c.mode === "compass" && (
            <div role="radiogroup" aria-label="Which direction?" className="grid max-w-[28rem] grid-cols-2 gap-[var(--space-xs)] sm:grid-cols-4">
              {DIRECTIONS.map((d) => {
                const on = manualValue === d.id;
                return (
                  <button key={d.id} type="button" role="radio" aria-checked={on} onClick={() => setManualValue(d.id)}
                    className={cn("inline-flex min-h-[var(--target-min)] items-center justify-center gap-[var(--space-xs)] rounded-[var(--radius-control)] border px-[var(--space-s)] text-[length:var(--text-label)]",
                      on ? "border-[var(--color-primary)] bg-[var(--color-surface-sage)] font-medium" : "border-[var(--color-border)] bg-[var(--color-surface)]")}>
                    {on && <span aria-hidden>✓</span>}{d.label}
                  </button>
                );
              })}
            </div>
          )}
          {c.mode === "tilt" && (
            <div className="max-w-[16rem]">
              <Field label="Angle in degrees (−90 to 90)" htmlFor={`tilt-${p.screen.screenKey}`}>
                <Input id={`tilt-${p.screen.screenKey}`} inputMode="numeric" value={manualValue} onChange={(e) => setManualValue(e.target.value.replace(/[^\d-]/g, ""))} />
              </Field>
            </div>
          )}
          {c.mode === "motion" && (
            <label className="inline-flex min-h-[var(--target-min)] items-center gap-[var(--space-s)]">
              <input type="checkbox" checked={manualValue === "done"} onChange={(e) => setManualValue(e.target.checked ? "done" : "")} className="h-5 w-5 accent-[var(--color-primary)]" />
              I did it {c.target} times
            </label>
          )}
          {sensor !== "unavailable" && sensor !== "denied" && (
            <div><Button type="button" variant="text" onClick={() => { setManual(false); setManualValue(""); }}>Use the device instead</Button></div>
          )}
        </div>
      )}
    </ScreenFrame>
  );
}
