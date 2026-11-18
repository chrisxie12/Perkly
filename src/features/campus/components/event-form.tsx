"use client";

import { useActionState } from "react";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { removeEventDetails, saveEventDetails } from "../engage-actions";
import { goingLabel, toLocalInput, type CampusEvent } from "../schemas";
import { ActionForm } from "./action-form";

/** Organisers turn a post into an event, or change its details. Times are Ghana time. */
export function EventForm({ postId, organisationId, event }: { postId: string; organisationId: string; event: CampusEvent | null }) {
  const [state, action] = useActionState(saveEventDetails, idleState);
  const e = state.fieldErrors ?? {};
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold">{event ? "Event details" : "Make this an event"}</h2>
      {event && <p className="text-sm text-ink-700">{goingLabel(event)}. You see the number, not who.</p>}
      <form action={action} noValidate className="space-y-4">
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="organisationId" value={organisationId} />
        <div>
          <Label htmlFor="ev-start">Starts</Label>
          <Input
            id="ev-start"
            name="startsAt"
            type="datetime-local"
            defaultValue={toLocalInput(event?.starts_at)}
            invalid={Boolean(e.startsAt)}
          />
          {e.startsAt ? <FieldError>{e.startsAt}</FieldError> : <FieldHint>Ghana time.</FieldHint>}
        </div>
        <div>
          <Label htmlFor="ev-end">Ends (optional)</Label>
          <Input id="ev-end" name="endsAt" type="datetime-local" defaultValue={toLocalInput(event?.ends_at)} invalid={Boolean(e.endsAt)} />
          {e.endsAt && <FieldError>{e.endsAt}</FieldError>}
        </div>
        <div>
          <Label htmlFor="ev-venue">Where</Label>
          <Input id="ev-venue" name="venue" maxLength={160} defaultValue={event?.venue ?? ""} invalid={Boolean(e.venue)} />
          {e.venue && <FieldError>{e.venue}</FieldError>}
        </div>
        <div>
          <Label htmlFor="ev-cap">Places (optional)</Label>
          <Input
            id="ev-cap"
            name="capacity"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={event?.capacity ?? ""}
            invalid={Boolean(e.capacity)}
          />
          {e.capacity ? <FieldError>{e.capacity}</FieldError> : <FieldHint>Leave empty for no limit.</FieldHint>}
        </div>
        <label className="flex items-start gap-3 text-ink-700">
          <input
            type="checkbox"
            name="rsvpOpen"
            defaultChecked={event?.rsvp_open ?? true}
            className="mt-0.5 size-5 shrink-0 accent-blue-500"
          />
          <span>Students can RSVP</span>
        </label>
        <SubmitButton size="sm">{event ? "Save event details" : "Make it an event"}</SubmitButton>
        <FormMessage state={state} />
      </form>
      {event && (
        <ActionForm
          action={removeEventDetails}
          fields={{ postId, organisationId }}
          label="Stop being an event"
          variant="ghost"
          confirm="Remove the event details? Everyone's RSVPs are removed too."
        />
      )}
    </div>
  );
}
