"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tokenFromScan } from "../schemas";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => Detector;
  }
}

/**
 * Rear-camera scanner. Uses BarcodeDetector where the browser has it and the
 * jsQR decoder elsewhere (iPhone Safari). Only Perqly /r/ links are accepted;
 * everything else shows "That's not a Perqly code".
 */
export function Scanner({ allowedOrigins }: { allowedOrigins: string[] }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "starting" | "scanning" | "denied" | "unsupported" | "opening">("idle");
  const [notPerqly, setNotPerqly] = useState(false);

  useEffect(() => {
    if (state !== "starting") return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const handle = (raw: string) => {
      const token = tokenFromScan(raw, [...allowedOrigins, window.location.origin]);
      if (!token) {
        setNotPerqly(true);
        return false;
      }
      stopped = true;
      setState("opening");
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
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [state, allowedOrigins]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-ink-900">
        <video
          ref={video}
          playsInline
          muted
          className={state === "scanning" || state === "opening" ? "size-full object-cover" : "hidden"}
        />
        {state !== "scanning" && state !== "opening" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
            {state === "denied" ? (
              <p className="flex flex-col items-center gap-3">
                <CameraOff className="size-8" aria-hidden /> Camera access is off. Allow it in your browser settings, or enter the code
                below.
              </p>
            ) : state === "unsupported" ? (
              <p>This browser can&apos;t use the camera. Enter the code printed under the QR instead.</p>
            ) : (
              <Button type="button" size="lg" onClick={() => setState("starting")} disabled={state === "starting"}>
                <Camera aria-hidden /> {state === "starting" ? "Starting camera…" : "Start camera"}
              </Button>
            )}
          </div>
        )}
        {state === "scanning" && <div className="pointer-events-none absolute inset-10 rounded-2xl border-4 border-white/80" aria-hidden />}
      </div>
      <p role="status" className="text-sm font-medium text-ink-700">
        {state === "opening"
          ? "Code found. Opening…"
          : notPerqly
            ? "That's not a Perqly code. Look for the Perqly poster at the counter."
            : state === "scanning"
              ? "Point your camera at the Perqly QR at the counter."
              : ""}
      </p>
    </div>
  );
}
