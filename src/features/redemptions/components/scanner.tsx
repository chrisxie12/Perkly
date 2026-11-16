"use client";

import { playSound } from "@/lib/sound";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CameraOff, Flashlight, Keyboard, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tokenFromScan } from "../schemas";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => Detector;
  }
}

/**
 * Full-screen rear-camera scanner. BarcodeDetector where the browser has it,
 * jsQR elsewhere (iPhone Safari). Only Perqly /r/ links are accepted.
 */
export function Scanner({ allowedOrigins, message }: { allowedOrigins: string[]; message?: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [state, setState] = useState<"starting" | "scanning" | "denied" | "unsupported" | "found">("starting");
  const [notPerqly, setNotPerqly] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const origins = [...allowedOrigins, window.location.origin];

    const handle = (raw: string) => {
      const token = tokenFromScan(raw, origins);
      if (!token) {
        setNotPerqly(true);
        return false;
      }
      stopped = true;
      setState("found");
      playSound("scan");
      // /r/<token> is a route handler that redirects, so this needs a full navigation.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/r/${token}`);
      return true;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setState("denied");
        return;
      }
      if (!video.current || stopped) return;
      track.current = stream.getVideoTracks()[0] ?? null;
      const caps = (track.current?.getCapabilities?.() ?? {}) as { torch?: boolean };
      if (caps.torch) setTorch(false);
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      setState("scanning");
      const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;
      let last = 0;
      const tick = async (t: number) => {
        if (stopped || !video.current) return;
        if (t - last > 250 && video.current.readyState >= 2) {
          last = t;
          try {
            if (detector) {
              const codes = await detector.detect(video.current);
              if (codes[0] && handle(codes[0].rawValue)) return;
            } else if (jsQR && ctx) {
              const w = video.current.videoWidth;
              const h = video.current.videoHeight;
              const scale = Math.min(1, 640 / Math.max(w, h));
              canvas.width = Math.round(w * scale);
              canvas.height = Math.round(h * scale);
              ctx.drawImage(video.current, 0, 0, canvas.width, canvas.height);
              const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
              if (code && handle(code.data)) return;
            }
          } catch {
            // A frame that can't be decoded; keep going.
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [allowedOrigins]);

  const toggleTorch = async () => {
    if (!track.current || torch === null) return;
    try {
      await track.current.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const hint =
    state === "found"
      ? "Code found. Opening…"
      : state === "denied"
        ? "Camera access is off. Allow it in your browser settings, or type the shop code."
        : state === "unsupported"
          ? "This browser can't use the camera. Type the shop code instead."
          : notPerqly
            ? "That's not a Perqly code. Look for the Perqly poster at the counter."
            : "Point at the Perqly QR on the counter";

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#05080F] text-white">
      <video
        ref={video}
        playsInline
        muted
        aria-hidden
        className={cn("absolute inset-0 size-full object-cover", state === "scanning" || state === "found" ? "opacity-100" : "opacity-0")}
      />
      <div className="pt-safe relative z-10 flex items-center gap-1 px-2 py-1">
        <Link href="/student" aria-label="Close scanner" className="grid size-11 place-items-center rounded-full hover:bg-white/10">
          <X className="size-6" aria-hidden />
        </Link>
        <h1 className="font-display text-lg font-bold">Scan the shop&apos;s QR</h1>
      </div>
      {message && (
        <p role="alert" className="relative z-10 mx-4 rounded-xl bg-white p-3 text-[0.9375rem] font-medium text-ink-900">
          {message}
        </p>
      )}
      <div className="relative z-0 flex flex-1 flex-col items-center justify-center px-6">
        <div
          aria-hidden
          className={cn(
            "relative size-60 rounded-[28px] shadow-[0_0_0_2000px_rgba(5,8,15,0.55)]",
            state === "found" && "scale-95 transition-transform",
          )}
        >
          {[
            "top-0 left-0 rounded-tl-3xl border-t-4 border-l-4",
            "top-0 right-0 rounded-tr-3xl border-t-4 border-r-4",
            "bottom-0 left-0 rounded-bl-3xl border-b-4 border-l-4",
            "right-0 bottom-0 rounded-br-3xl border-r-4 border-b-4",
          ].map((c) => (
            <span key={c} className={cn("absolute size-11", c, state === "found" ? "border-emerald-400" : "border-white")} />
          ))}
          {state === "scanning" && (
            <span className="absolute inset-x-4 top-5 h-0.5 animate-[scanline_1.8s_ease-in-out_infinite_alternate] bg-blue-500 shadow-[0_0_12px_2px_rgba(0,102,255,0.8)] motion-reduce:animate-none" />
          )}
          {(state === "denied" || state === "unsupported") && <CameraOff className="absolute inset-0 m-auto size-10 text-white/70" />}
        </div>
        <p role="status" className="mt-6 max-w-xs text-center font-semibold">
          {hint}
          {state === "scanning" && !notPerqly && (
            <small className="mt-0.5 block font-normal text-white/70">Hold steady. It scans on its own.</small>
          )}
        </p>
      </div>
      <div className="pb-safe relative z-10 flex justify-center gap-3 px-5 pb-7">
        {torch !== null && (
          <button
            type="button"
            onClick={toggleTorch}
            aria-pressed={torch}
            className={cn(
              "flex h-12 items-center gap-2 rounded-full px-5 font-semibold backdrop-blur",
              torch ? "bg-white text-ink-900" : "bg-white/15 text-white",
            )}
          >
            <Flashlight className="size-5" aria-hidden /> Light
          </button>
        )}
        <Link href="/student/scan/code" className="flex h-12 items-center gap-2 rounded-full bg-white/15 px-5 font-semibold backdrop-blur">
          <Keyboard className="size-5" aria-hidden /> Type shop code
        </Link>
      </div>
    </div>
  );
}
