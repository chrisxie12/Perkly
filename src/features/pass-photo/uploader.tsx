"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { savePassPhoto } from "./actions";

/** Square-crops and shrinks the photo to 512px WebP in the browser, then uploads it. */
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 512, 512);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob || blob.type !== "image/webp") {
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!jpeg) throw new Error("encode failed");
    return jpeg;
  }
  return blob;
}

export function PassPhotoUploader({ userId, hasPhoto }: { userId: string; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await toSquareWebp(file);
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/pass.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("pass-photos")
        .upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "60" });
      if (error) throw error;
      const result = await savePassPhoto(path);
      if (!result.ok) throw new Error(result.message);
      setMessage("Saved. It's on your pass now.");
      router.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error && e.message && !e.message.includes("fetch")
          ? e.message
          : "That photo couldn't be uploaded. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        id="pass-photo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="button" size="lg" disabled={busy} onClick={() => input.current?.click()}>
          <Camera aria-hidden /> {busy ? "Saving…" : hasPhoto ? "Take a new photo" : "Take your photo"}
        </Button>
        {hasPhoto && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await savePassPhoto(null);
              setBusy(false);
              setMessage(r.ok ? "Removed." : (r.message ?? "Couldn't remove it."));
              router.refresh();
            }}
          >
            <Trash2 aria-hidden /> Remove
          </Button>
        )}
      </div>
      <p role="status" className="min-h-6 text-[0.9375rem] font-medium text-ink-700">
        {message}
      </p>
    </div>
  );
}
