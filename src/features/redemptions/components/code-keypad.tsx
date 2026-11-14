"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Delete, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { confirmByCode } from "../actions";

/** "Enter code" sheet for when a pass didn't appear on the counter on its own. */
export function CodeKeypad({ merchantId }: { merchantId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const press = (d: string) => {
    if (code.length >= 4) return;
    const next = code + d;
    setCode(next);
    if (next.length === 4) window.setTimeout(() => form.current?.requestSubmit(), 120);
  };
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="!bg-ink-900">
        <Keyboard aria-hidden /> Enter code
      </Button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="kp-h">
            <button type="button" aria-label="Close" className="absolute inset-0 bg-ink-900/50" onClick={() => setOpen(false)} />
            <form ref={form} action={confirmByCode} className="pb-safe relative w-full max-w-lg rounded-t-3xl bg-white px-5 pt-3 pb-6">
              <input type="hidden" name="merchantId" value={merchantId} />
              <input type="hidden" name="code" value={code} />
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink-300" aria-hidden />
              <h2 id="kp-h" className="font-display text-xl font-bold">
                Enter the student&apos;s code
              </h2>
              <p className="text-[0.9375rem] text-ink-600">The 4 digits on their live pass. This confirms the discount.</p>
              <div
                className="my-4 flex justify-center gap-2.5"
                aria-live="polite"
                aria-label={`Code entered: ${code.split("").join(" ") || "none"}`}
              >
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "grid h-17 w-14 place-items-center rounded-2xl border-2 font-display text-3xl font-extrabold",
                      i === code.length ? "border-blue-500" : "border-ink-300",
                    )}
                  >
                    {code[i] ?? ""}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => press(d)}
                    className="h-14 rounded-2xl bg-ink-100 text-2xl font-bold active:bg-blue-50"
                  >
                    {d}
                  </button>
                ))}
                <button type="button" onClick={() => setOpen(false)} className="h-14 rounded-2xl bg-ink-100 text-base font-bold">
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => press("0")}
                  className="h-14 rounded-2xl bg-ink-100 text-2xl font-bold active:bg-blue-50"
                >
                  0
                </button>
                <button
                  type="button"
                  aria-label="Delete"
                  onClick={() => setCode(code.slice(0, -1))}
                  className="grid h-14 place-items-center rounded-2xl bg-ink-100"
                >
                  <Delete className="size-6" aria-hidden />
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
