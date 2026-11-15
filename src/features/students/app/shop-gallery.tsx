"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Photo = { id: string; url: string; caption: string | null };

/** The cover, a grid of the rest, and a full-screen viewer. Photos are the business's own uploads. */
export function ShopGallery({ photos, name }: { photos: Photo[]; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);

  const open = (i: number) => {
    setIndex(i);
    dialog.current?.showModal();
  };
  const step = (d: number) => setIndex((i) => (i + d + photos.length) % photos.length);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- step only depends on photos.length
  }, [photos.length]);

  if (photos.length === 0) return null;
  const current = photos[index];

  return (
    <>
      <button
        type="button"
        onClick={() => open(0)}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-ink-100 sm:rounded-3xl"
        aria-label={`Open photos of ${name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
        <img src={photos[0].url} alt={photos[0].caption ?? `${name}`} className="size-full object-cover" />
        {photos.length > 1 && (
          <span className="absolute right-3 bottom-3 rounded-full bg-ink-900/80 px-3 py-1.5 text-sm font-semibold text-white">
            {photos.length} photos
          </span>
        )}
      </button>

      <dialog
        ref={dialog}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black/80"
        aria-label={`Photos of ${name}`}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between p-2">
            <span className="px-3 text-sm font-semibold">
              {index + 1} of {photos.length}
            </span>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="grid size-11 place-items-center rounded-full hover:bg-white/10"
              aria-label="Close photos"
            >
              <X className="size-6" aria-hidden />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
            <img
              src={current.url}
              alt={current.caption ?? `${name}, photo ${index + 1}`}
              className="max-h-full max-w-full object-contain"
            />
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  className="absolute left-2 grid size-11 place-items-center rounded-full bg-black/50 hover:bg-black/70"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-6" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  className="absolute right-2 grid size-11 place-items-center rounded-full bg-black/50 hover:bg-black/70"
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-6" aria-hidden />
                </button>
              </>
            )}
          </div>
          <p className="min-h-14 px-5 py-4 text-center text-[0.9375rem]">{current.caption}</p>
        </div>
      </dialog>

      {photos.length > 1 && <ShopPhotoGrid photos={photos} onOpen={open} />}
    </>
  );
}

function ShopPhotoGrid({ photos, onOpen }: { photos: Photo[]; onOpen: (i: number) => void }) {
  return (
    <section aria-labelledby="photos-h" className="order-last">
      <h2 id="photos-h" className="sr-only">
        Photos
      </h2>
      <ul className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:px-0">
        {photos.slice(1).map((p, i) => (
          <li key={p.id} className="shrink-0">
            <button type="button" onClick={() => onOpen(i + 1)} className="block size-20 overflow-hidden rounded-xl bg-ink-100">
              {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
              <img src={p.url} alt={p.caption ?? `Photo ${i + 2}`} className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
