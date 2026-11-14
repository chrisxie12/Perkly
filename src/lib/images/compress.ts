/**
 * Shrinks a photo in the browser before upload: longest side at most 1600 px,
 * WebP where the browser can encode it (JPEG otherwise, e.g. older iPhones).
 * Also drops EXIF data such as location, because the canvas doesn't keep it.
 */
export async function compressImage(file: File, maxSide = 1600): Promise<{ blob: Blob; extension: "webp" | "jpg" }> {
  if (!file.type.startsWith("image/")) throw new Error("not_an_image");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, extension: "webp" };
  const jpeg = await toBlob("image/jpeg");
  if (!jpeg) throw new Error("encode_failed");
  return { blob: jpeg, extension: "jpg" };
}
