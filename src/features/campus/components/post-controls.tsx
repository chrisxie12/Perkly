"use client";

import { useActionState, useState } from "react";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { publishPost, setPostPin, setPostStatus } from "../actions";
import { ActionForm } from "./action-form";

/** Publish now or schedule (Ghana time). Shown for drafts and scheduled posts. */
export function PublishForm({ postId, organisationId }: { postId: string; organisationId: string }) {
  const [state, action] = useActionState(publishPost, idleState);
  const [when, setWhen] = useState<"now" | "schedule">("now");
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-ink-900">When should it go live?</legend>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            name="when"
            value="now"
            checked={when === "now"}
            onChange={() => setWhen("now")}
            className="size-4 accent-blue-500"
          />
          Now
        </label>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            name="when"
            value="schedule"
            checked={when === "schedule"}
            onChange={() => setWhen("schedule")}
            className="size-4 accent-blue-500"
          />
          At a set time
        </label>
      </fieldset>
      {when === "schedule" && (
        <div>
          <Label htmlFor="publish-at">Date and time (Ghana time)</Label>
          <Input id="publish-at" name="publishAt" type="datetime-local" invalid={Boolean(state.fieldErrors?.publishAt)} />
          {state.fieldErrors?.publishAt && <FieldError>{state.fieldErrors.publishAt}</FieldError>}
          <p className="mt-2 text-sm text-ink-600">
            Followers aren&apos;t notified about scheduled posts yet. It still appears in the feed on time.
          </p>
        </div>
      )}
      <SubmitButton>{when === "now" ? "Publish now" : "Schedule"}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function PinForm({ postId, organisationId, pinned }: { postId: string; organisationId: string; pinned: boolean }) {
  const [state, action] = useActionState(setPostPin, idleState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <div>
        <Label htmlFor="pin-days">Pin to the top of Campus</Label>
        <NativeSelect id="pin-days" name="days" defaultValue={pinned ? "0" : "7"}>
          {pinned && <option value="0">Unpin</option>}
          <option value="1">For 1 day</option>
          <option value="3">For 3 days</option>
          <option value="7">For 7 days</option>
          <option value="14">For 14 days</option>
          <option value="30">For 30 days</option>
        </NativeSelect>
      </div>
      <SubmitButton variant="secondary">Save pin</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** The status changes an editor can make from where the post is now. */
export function StatusButtons({
  postId,
  organisationId,
  status,
  scheduled,
}: {
  postId: string;
  organisationId: string;
  status: string;
  scheduled: boolean;
}) {
  const fields = (s: string) => ({ postId, organisationId, status: s });
  return (
    <div className="flex flex-wrap gap-3">
      {status === "published" && !scheduled && <ActionForm action={setPostStatus} fields={fields("hidden")} label="Hide from students" />}
      {status === "published" && scheduled && <ActionForm action={setPostStatus} fields={fields("draft")} label="Cancel the schedule" />}
      {status === "hidden" && <ActionForm action={setPostStatus} fields={fields("published")} label="Show again" />}
      <ActionForm
        action={setPostStatus}
        fields={fields("removed")}
        label="Remove for good"
        confirm="Remove this post for good? Students will no longer see it, and it can't be brought back."
      />
    </div>
  );
}
