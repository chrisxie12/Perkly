import { Stars } from "./stars";
import type { Review } from "../queries";

const date = new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });

export function RatingSummary({ rating, reviews }: { rating: number | null; reviews: number }) {
  if (!rating || reviews === 0)
    return <p className="text-ink-600">No ratings yet. Students can rate a shop after a discount goes through there.</p>;
  return (
    <div className="flex items-center gap-4">
      <span className="font-display text-5xl leading-none font-black text-ink-900">{rating.toFixed(1)}</span>
      <span>
        <Stars value={rating} />
        <span className="block text-sm text-ink-600">
          From {reviews} {reviews === 1 ? "student" : "students"} who visited
        </span>
      </span>
    </div>
  );
}

export function ReviewList({ reviews, staffAction }: { reviews: Review[]; staffAction?: (r: Review) => React.ReactNode }) {
  if (reviews.length === 0) return null;
  return (
    <ul className="divide-y divide-ink-200 rounded-3xl bg-white px-4 ring-1 ring-ink-200/70">
      {reviews.map((r) => (
        <li key={r.id} className={r.hidden ? "py-3.5 opacity-60" : "py-3.5"}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-ink-900">{r.author}</span>
            <span className="text-xs text-ink-600">{date.format(new Date(r.created_at))}</span>
          </div>
          <Stars value={r.rating} className="mt-0.5" />
          <span className="sr-only">{r.rating} out of 5</span>
          {r.comment && <p className="mt-1.5 text-[0.9375rem] text-ink-700">{r.comment}</p>}
          {r.hidden && <p className="mt-1 text-xs font-semibold text-ink-600">Hidden by Perqly</p>}
          {staffAction?.(r)}
        </li>
      ))}
    </ul>
  );
}
