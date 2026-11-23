"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FormState } from "@/features/auth/types";
import { submitReview } from "../actions";

const LABELS = ["", "Poor", "Not great", "Okay", "Good", "Excellent"];

export function ReviewForm({
  merchantId,
  merchantName,
  back,
  initialRating,
  initialComment,
}: {
  merchantId: string;
  merchantName: string;
  back: string;
  initialRating: number | null;
  initialComment: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitReview, { status: "idle" });
  const [rating, setRating] = useState(initialRating ?? 0);
  return (
    <form action={action} className="rounded-3xl bg-white p-4 ring-1 ring-ink-200/70">
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="back" value={back} />
      <fieldset>
        <legend className="font-bold text-ink-900">{initialRating ? "Your rating" : `How was ${merchantName}?`}</legend>
        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" />
              <Star
                className={cn(
                  "size-9 rounded-md transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 active:scale-90",
                  n <= rating ? "fill-orange-500 text-orange-500" : "text-ink-300",
                )}
                aria-hidden
              />
              <span className="sr-only">
                {n} {n === 1 ? "star" : "stars"}, {LABELS[n]}
              </span>
            </label>
          ))}
          <span className="ml-2 text-sm font-semibold text-ink-700" aria-hidden>
            {LABELS[rating]}
          </span>
        </div>
      </fieldset>
      <label htmlFor="review-comment" className="mt-4 block text-sm font-semibold text-ink-900">
        Anything to add? <span className="font-normal text-ink-600">(optional)</span>
      </label>
      <textarea
        id="review-comment"
        name="comment"
        maxLength={500}
        rows={3}
        defaultValue={initialComment ?? ""}
        placeholder="What should other students know?"
        className="mt-1.5 w-full rounded-xl bg-ink-50 p-3 text-[0.9375rem] text-ink-900 ring-1 ring-ink-200 placeholder:text-ink-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
      />
      <p className="mt-1 text-xs text-ink-600">Other students and the business see your first name and initial.</p>
      <button
        type="submit"
        disabled={rating === 0 || pending}
        className="text-on-lime mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-orange-500 font-bold disabled:opacity-50"
      >
        {pending ? "Saving…" : initialRating ? "Update rating" : "Post rating"}
      </button>
      {state.status !== "idle" && state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={cn("mt-2 text-sm font-medium", state.status === "error" ? "text-red-700" : "text-emerald-700")}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
