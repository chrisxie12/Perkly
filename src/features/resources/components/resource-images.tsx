"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { setResourceImage } from "../actions";
import type { Resource } from "../model";
import { ResourceCover, ResourceLogo } from "./bits";

type Kind = "logo" | "cover";

const SPEC: Record<Kind, { max: number; title: string; hint: string }> = {
  logo: { max: 512, title: "Logo", hint: "Square works best. Use the provider's official logo from their brand or press kit." },
  cover: { max: 1600, title: "Cover photo", hint: "Wide image, about 3:1. Use a photo or banner you have the right to use." },
};

/** Shrinks the image in the browser. Logos keep transparency (webp, else png); covers fall back to jpeg. */
async function shrink(file: File, kind: Kind): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SPEC[kind].max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  if (webp && webp.type === "image/webp") return webp;
  const fallback = kind === "logo" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, fallback, 0.85));
  if (!blob) throw new Error("encode failed");
  return blob;
}

const EXT: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

function ImageSlot({ resource, kind }: { resource: Resource; kind: Kind }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const current = kind === "logo" ? resource.logo_path : resource.cover_path;

  const run = async (file: File | null) => {
    setBusy(true);
    setMessage(null);
    try {
      let path: string | null = null;
      if (file) {
        if (file.size > 15 * 1024 * 1024) throw new Error("That file is too large. Choose an image under 15 MB.");
        const blob = await shrink(file, kind);
        path = `${resource.id}/${crypto.randomUUID()}.${EXT[blob.type] ?? "jpg"}`;
        const { error } = await createClient()
          .storage.from("resource-images")
          .upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
        if (error) throw new Error("That image couldn't be uploaded. Check your connection and try again.");
      }
      const r = await setResourceImage(resource.id, kind, path);
      if (!r.ok) throw new Error(r.message);
      setMessage(file ? `${SPEC[kind].title} updated.` : `${SPEC[kind].title} removed.`);
      router.refresh();
    } catch (err) {
      setMessage(
        err instanceof Error && err.message !== "encode failed" && err.message !== "no canvas"
          ? err.message
          : "That image couldn't be read. Try a PNG or JPG.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-200">
      <div>
        <h3 className="font-bold text-ink-900">{SPEC[kind].title}</h3>
        <p className="text-sm text-ink-600">{SPEC[kind].hint}</p>
      </div>
      {kind === "logo" ? <ResourceLogo resource={resource} size="lg" /> : <ResourceCover resource={resource} className="h-24 rounded-xl" />}
      {!current && <p className="text-[0.8125rem] text-ink-600">No image yet. Students see the category design.</p>}
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={`Upload ${SPEC[kind].title.toLowerCase()}`}
          onChange={(e) => void run(e.target.files?.[0] ?? null)}
        />
        <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus aria-hidden className="size-4" />
          {busy ? "Uploading…" : current ? "Replace" : "Upload"}
        </Button>
        {current && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void run(null)}>
            <Trash2 aria-hidden className="size-4" />
            Remove
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="text-sm font-semibold text-ink-700">
          {message}
        </p>
      )}
    </div>
  );
}

export function ResourceImages({ resource }: { resource: Resource }) {
  return (
    <section aria-labelledby="images-heading" className="mb-6">
      <h2 id="images-heading" className="mb-3 text-lg font-bold">
        Images
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <ImageSlot resource={resource} kind="logo" />
        <ImageSlot resource={resource} kind="cover" />
      </div>
    </section>
  );
}
