"use client";

import { startTransition, useActionState, useOptimistic, useState } from "react";
import { Bookmark, Flag, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { ShareButton } from "@/features/students/app/share-button";
import { reportContent, setLike, setSave } from "../actions";
import { REPORT_REASONS } from "../schemas";

const iconButton =
  "inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-ink-700 hover:bg-ink-100 active:scale-95";

/** Like, save, share and report. Like and save change instantly and roll back if the save fails. */
export function PostButtons({
  postId,
  title,
  liked,
  saved,
  likeCount,
  sharePath,
}: {
  postId: string;
  title: string;
  liked: boolean;
  saved: boolean;
  likeCount: number;
  sharePath: string;
}) {
  const [like, setLikeShown] = useOptimistic({ on: liked, count: likeCount });
  const [save, setSaveShown] = useOptimistic(saved);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-pressed={like.on}
          className={cn(iconButton, like.on && "text-red-600")}
          onClick={() =>
            startTransition(async () => {
              const next = !like.on;
              setLikeShown({ on: next, count: like.count + (next ? 1 : -1) });
              const r = await setLike(postId, next);
              setError(r.ok ? null : r.message);
            })
          }
        >
          <Heart className={cn("size-5", like.on && "fill-current")} aria-hidden />
          <span>
            {like.count} <span className="sr-only">likes. {like.on ? "Unlike" : "Like"} this post</span>
          </span>
        </button>
        <button
          type="button"
          aria-pressed={save}
          className={cn(iconButton, save && "text-blue-700")}
          onClick={() =>
            startTransition(async () => {
              const next = !save;
              setSaveShown(next);
              const r = await setSave(postId, next);
              setError(r.ok ? null : r.message);
            })
          }
        >
          <Bookmark className={cn("size-5", save && "fill-current")} aria-hidden />
          {save ? "Saved" : "Save"}
        </button>
        <ShareButton title={title} path={sharePath} className={iconButton} />
        <ReportDialog targetType="post" targetId={postId} />
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function ReportDialog({ targetType, targetId }: { targetType: "post" | "comment" | "organisation"; targetId: string }) {
  const [state, action] = useActionState(reportContent, idleState);
  const e = state.fieldErrors ?? {};
  return (
    <Dialog>
      <DialogTrigger className={iconButton}>
        <Flag className="size-5" aria-hidden /> Report
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Report this {targetType}</DialogTitle>
        <DialogDescription>Perqly reviews every report. The organisation isn&apos;t told who reported it.</DialogDescription>
        {state.status === "success" ? (
          <FormMessage state={state} />
        ) : (
          <form action={action} className="mt-4 space-y-4" noValidate>
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <div>
              <Label htmlFor="report-reason">What&apos;s wrong?</Label>
              <NativeSelect id="report-reason" name="reason" defaultValue="" invalid={Boolean(e.reason)}>
                <option value="" disabled>
                  Choose a reason
                </option>
                {REPORT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </NativeSelect>
              {e.reason && <FieldError>{e.reason}</FieldError>}
            </div>
            <div>
              <Label htmlFor="report-note">Anything else Perqly should know? (optional)</Label>
              <Textarea id="report-note" name="note" rows={3} maxLength={500} />
            </div>
            <SubmitButton>Send report</SubmitButton>
            <FormMessage state={state} />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
