"use client";

import * as React from "react";
import { useActionState } from "react";
import { BadgeCheck, Camera, CircleAlert, ScanLine, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { playSound } from "@/lib/sound";
import { doorAction, type DoorState } from "../engage-actions";
import { formatCedis, formatTicketCode, savingLabel } from "../schemas";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * What a scanned ticket QR holds: the ticket's secret ("PQT1:" + 32 hex, since Events &
 * Conferences), or just its 8-character code (older tickets). Both are checked by the database.
 */
export const codeFrom = (raw: string) => {
  const secret = raw.trim().match(/^PQT1:[0-9a-f]{32}$/i)?.[0];
  if (secret) return secret;
  return raw.toUpperCase().match(/[A-HJ-NP-Z2-9]{8}/)?.[0] ?? null;
};

/** A small rear-camera reader for ticket QRs. BarcodeDetector where available, jsQR elsewhere. */
function TicketCamera({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = React.useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setFailed(true);
        return;
      }
      if (!video.current || stopped) return;
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const detector = Native ? new Native({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;
      let last = 0;
      const tick = async (t: number) => {
        if (stopped || !video.current) return;
        if (t - last > 250 && video.current.readyState >= 2) {
          last = t;
          try {
            let raw: string | null = null;
            if (detector) raw = (await detector.detect(video.current))[0]?.rawValue ?? null;
            else if (jsQR && ctx) {
              const w = video.current.videoWidth;
              const h = video.current.videoHeight;
              const scale = Math.min(1, 640 / Math.max(w, h));
              canvas.width = Math.round(w * scale);
              canvas.height = Math.round(h * scale);
              ctx.drawImage(video.current, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              raw = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
            const code = raw ? codeFrom(raw) : null;
            if (code) {
              stopped = true;
              playSound("scan");
              onCode(code);
              return;
            }
          } catch {
            // Undecodable frame; keep going.
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [onCode]);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#05080F]">
      <video ref={video} playsInline muted aria-hidden className="aspect-square w-full object-cover" />
      <div aria-hidden className="pointer-events-none absolute inset-10 rounded-3xl ring-2 ring-white/80" />
      <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white" role="status">
        {failed ? "The camera is off. Type the code below." : "Point at the ticket QR"}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close camera"
        className="absolute top-3 right-3 grid size-10 place-items-center rounded-full bg-black/50 text-white"
      >
        <X className="size-5" aria-hidden />
      </button>
    </div>
  );
}

/** The organiser's door: scan or type a ticket, see the student, check them in. */
export function DoorCheck({ postId }: { postId: string }) {
  const [state, action, pending] = useActionState<DoorState, FormData>(doorAction, { status: "idle" });
  const [camera, setCamera] = React.useState(false);
  const [code, setCode] = React.useState("");
  const form = React.useRef<HTMLFormElement>(null);

  const onCode = React.useCallback((c: string) => {
    setCamera(false);
    setCode(c);
    requestAnimationFrame(() => form.current?.requestSubmit());
  }, []);

  React.useEffect(() => {
    if (state.status === "checked_in") playSound("success");
  }, [state]);

  const ticket = state.status === "found" || state.status === "checked_in" ? state.ticket : null;
  const done = state.status === "checked_in" || ticket?.status === "checked_in";

  const next = () => {
    setCode("");
    form.current?.reset();
  };

  return (
    <div className="space-y-5">
      {camera ? (
        <TicketCamera onCode={onCode} onClose={() => setCamera(false)} />
      ) : (
        <Button type="button" size="lg" className="w-full" onClick={() => setCamera(true)}>
          <Camera aria-hidden /> Scan a ticket
        </Button>
      )}

      <form ref={form} action={action} className="flex items-end gap-2">
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="step" value="find" />
        <div className="flex-1">
          <Label htmlFor="door-code">Or type the code</Label>
          <Input
            id="door-code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCD 2345"
            className="font-mono tracking-widest uppercase"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          <ScanLine aria-hidden /> Find
        </Button>
      </form>

      {state.status === "error" && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 font-medium text-ink-900">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden /> {state.message}
        </p>
      )}

      {ticket && (
        <section aria-live="polite" className="glass glass-card p-5">
          <div className="flex items-center gap-4">
            {ticket.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img src={ticket.photo_url} alt={`Pass photo of ${ticket.name}`} className="size-24 rounded-2xl object-cover" />
            ) : (
              <span className="grid size-24 place-items-center rounded-2xl bg-ink-100 text-ink-600" aria-label="No pass photo">
                <UserRound className="size-10" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <p className="font-display text-xl font-bold">{ticket.name}</p>
              <p className="font-mono text-sm tracking-widest text-ink-700">{formatTicketCode(ticket.code)}</p>
              {ticket.still_verified === false ? (
                <p className="mt-1 text-sm font-semibold text-red-700">No longer a verified student</p>
              ) : (
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-success">
                  <BadgeCheck className="size-4" aria-hidden /> Verified student
                </p>
              )}
            </div>
          </div>
          <div className="mt-5 rounded-2xl bg-white/80 p-4">
            <p className="text-sm text-ink-700">Collect</p>
            <p className="font-display text-3xl font-extrabold">{formatCedis(ticket.student_price)}</p>
            <p className="text-sm text-ink-700">
              Normally {formatCedis(ticket.normal_price)}. {savingLabel(ticket.normal_price, ticket.student_price)}.
            </p>
          </div>
          {done ? (
            <div className="mt-5 space-y-3">
              <p className="flex items-center gap-2 rounded-2xl bg-green-50 p-4 font-semibold text-ink-900" role="status">
                <BadgeCheck className="size-5 text-success" aria-hidden />
                {state.status === "checked_in" ? "Checked in. Let them in." : "Already checked in."}
              </p>
              <Button type="button" variant="secondary" className="w-full" onClick={next}>
                Next ticket
              </Button>
            </div>
          ) : (
            <form action={action} className="mt-5">
              <input type="hidden" name="postId" value={postId} />
              <input type="hidden" name="code" value={ticket.code} />
              <input type="hidden" name="step" value="check_in" />
              <p className="mb-3 text-sm text-ink-700">Match the face, take the money, then check them in.</p>
              <Button type="submit" size="lg" className="w-full" disabled={pending || ticket.still_verified === false}>
                <BadgeCheck aria-hidden /> Paid. Check in
              </Button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
