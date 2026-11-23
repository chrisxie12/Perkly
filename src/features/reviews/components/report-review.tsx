"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { reportReview } from "../actions";

const REASONS = [
  ["spam", "Spam or advertising"],
  ["rude", "Rude or hateful"],
  ["false", "Not a real visit, or untrue"],
  ["personal", "Shares someone's personal details"],
  ["other", "Something else"],
] as const;

/** "Report" under a rating: pick a reason, add a note if you like, send to Perqly support. */
export function ReportReview({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) {
    return (
      <p role="status" className="mt-2 text-sm font-medium text-emerald-700">
        {result.message}
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-red-700"
      >
        <Flag className="size-4" aria-hidden /> Report
      </button>
    );
  }
  return (
    <form
      className="mt-2 space-y-3 rounded-2xl bg-ink-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason) return setResult({ ok: false, message: "Choose a reason." });
        start(async () => setResult(await reportReview(reviewId, reason, note)));
      }}
    >
      <fieldset>
        <legend className="text-sm font-bold text-ink-900">What&apos;s wrong with this rating?</legend>
        <div className="mt-2 space-y-1">
          {REASONS.map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2 text-[0.9375rem] text-ink-900">
              <input
                type="radio"
                name={`reason-${reviewId}`}
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="size-4 accent-blue-500"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`report-note-${reviewId}`} className="text-sm font-semibold text-ink-900">
          Anything else? <span className="font-normal text-ink-600">(optional)</span>
        </label>
        <textarea
          id={`report-note-${reviewId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          className="mt-1.5 w-full rounded-xl bg-white p-3 text-[0.9375rem] text-ink-900 ring-1 ring-ink-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-full bg-ink-900 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send report"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setResult(null);
          }}
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-ink-700 hover:bg-ink-100"
        >
          Cancel
        </button>
      </div>
      {result && !result.ok && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {result.message}
        </p>
      )}
    </form>
  );
}
