"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Shrinks an image to at most 1600px on its longest side and uploads it to the
 * campus-media bucket under <school>/<organisation>/<post|logo>/<random>.<ext>.
 * Storage rules let only that organisation's editors upload there; nothing is
 * ever overwritten. Returns the stored path.
 */
export async function uploadCampusImage(file: File, institutionId: string, organisationId: string, kind: "post" | "logo"): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo or image file.");
  const bitmap = await createImageBitmap(file);
  const max = kind === "logo" ? 512 : 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare the image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob || blob.type !== "image/webp") blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("This browser can't prepare the image.");
  if (blob.size > 5 * 1024 * 1024) throw new Error("That image is too large. Try a smaller one.");
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${institutionId}/${organisationId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await createClient().storage.from("campus-media").upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error("The image couldn't be uploaded. Check your connection and try again.");
  return path;
}
