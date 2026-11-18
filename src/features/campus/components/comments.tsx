"use client";

import { useActionState, useEffect, useRef } from "react";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { addComment, hideComment, removeComment } from "../engage-actions";
import { formatPostTime, type CampusComment } from "../schemas";
import { ActionForm } from "./action-form";
import { ReportDialog } from "./post-buttons";

/**
 * Comments under a post. Shown only while comments are switched on. Authors appear
 * by first name. Students delete their own; organisers and Perqly support hide any.
 */
export function Comments({ postId, comments, canModerate }: { postId: string; comments: CampusComment[]; canModerate: boolean }) {
  return (
    <section className="mt-8" aria-labelledby="comments">
      <h2 id="comments" className="font-display text-lg font-bold">
        Comments{comments.length > 0 ? ` (${comments.length})` : ""}
      </h2>
      {comments.length === 0 ? (
        <p className="mt-2 text-ink-600">No comments yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-white p-3 ring-1 ring-ink-200">
              <p className="text-sm">
                <span className="font-semibold text-ink-900">{c.mine ? "You" : c.author}</span>{" "}
                <span className="text-ink-600">· {formatPostTime(c.created_at)}</span>
              </p>
              <p className="mt-1 whitespace-pre-line text-ink-800">{c.body}</p>
              <div className="mt-2 flex flex-wrap items-start gap-2">
                {c.mine && (
                  <ActionForm
                    action={removeComment}
                    fields={{ commentId: c.id, postId }}
                    label="Delete"
                    variant="ghost"
                    confirm="Delete your comment?"
                  />
                )}
                {!c.mine && canModerate && (
                  <ActionForm
                    action={hideComment}
                    fields={{ commentId: c.id, postId }}
                    label="Hide"
                    variant="ghost"
                    confirm="Hide this comment for everyone?"
                  />
                )}
                {!c.mine && <ReportDialog targetType="comment" targetId={c.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <CommentForm postId={postId} />
    </section>
  );
}

function CommentForm({ postId }: { postId: string }) {
  const [state, action] = useActionState(addComment, idleState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);
  const error = state.fieldErrors?.body;
  return (
    <form ref={ref} action={action} noValidate className="mt-4 space-y-3">
      <input type="hidden" name="postId" value={postId} />
      <div>
        <Label htmlFor="comment-body">Add a comment</Label>
        <Textarea id="comment-body" name="body" rows={3} maxLength={1000} invalid={Boolean(error)} />
        {error && <FieldError>{error}</FieldError>}
      </div>
      <p className="text-sm text-ink-600">Other students see your first name. Keep it respectful: comments can be reported.</p>
      <SubmitButton size="sm">Post comment</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
