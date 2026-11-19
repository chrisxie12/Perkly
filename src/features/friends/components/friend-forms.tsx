"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { cn } from "@/lib/utils";
import { friendAction, reportStudent, setSocialSettings, setStudentReportStatus, shareDeal } from "../actions";
import { REPORT_REASONS, type SocialSettings } from "../schemas";

export type FriendOp = "add" | "accept" | "decline" | "remove" | "block" | "unblock";

/** A small button that runs one friend action for one student. */
export function FriendButton({
  userId,
  op,
  label,
  variant = "secondary",
  confirm,
  className,
}: {
  userId: string;
  op: FriendOp;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  confirm?: string;
  className?: string;
}) {
  const [state, action] = useActionState(friendAction, idleState);
  return (
    <form
      action={action}
      className={cn("inline-flex flex-col items-end", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton size="sm" variant={variant} className="rounded-full">
        {label}
      </SubmitButton>
      {state.status === "error" && (
        <p role="alert" className="mt-1 max-w-48 text-right text-xs font-medium text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}

function Toggle({ name, defaultChecked, title, text }: { name: string; defaultChecked: boolean; title: string; text: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block font-semibold text-ink-900">{title}</span>
        <span className="block text-sm text-ink-600">{text}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span
          aria-hidden
          className="h-7 w-12 rounded-full bg-ink-200 transition-colors peer-checked:bg-blue-500 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2"
        />
        <span
          aria-hidden
          className="absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}

export function SocialSettingsForm({ settings }: { settings: SocialSettings }) {
  const [state, action] = useActionState(setSocialSettings, idleState);
  return (
    <form action={action} className="divide-y divide-ink-100">
      <Toggle
        name="findable"
        defaultChecked={settings.findable}
        title="Let classmates find me"
        text="Verified students at your school can find you by name and send you a request."
      />
      <Toggle
        name="share_activity"
        defaultChecked={settings.share_activity}
        title="Show my activity to friends"
        text="Friends see deals you used, shops you saved and events you're going to."
      />
      <div className="flex items-center justify-between gap-3 pt-3">
        <FormMessage state={state} />
        <SubmitButton size="sm" className="ml-auto rounded-full">
          Save
        </SubmitButton>
      </div>
    </form>
  );
}

export function ShareDealButton({ offerId, friends }: { offerId: string; friends: { user_id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(shareDeal, idleState);
  const id = useId();
  const e = state.fieldErrors ?? {};
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="rounded-full">
          <Send aria-hidden /> Send to a friend
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Send this deal to a friend</DialogTitle>
        <DialogDescription>They get a notification with a link to the deal.</DialogDescription>
        <form ref={form} action={action} noValidate className="mt-4 space-y-4">
          <input type="hidden" name="offerId" value={offerId} />
          <div>
            <Label htmlFor={`${id}-f`}>Friend</Label>
            <NativeSelect id={`${id}-f`} name="friendId" defaultValue="" invalid={Boolean(e.friendId)}>
              <option value="" disabled>
                Choose a friend
              </option>
              {friends.map((f) => (
                <option key={f.user_id} value={f.user_id}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
            {e.friendId && <FieldError>{e.friendId}</FieldError>}
          </div>
          <div>
            <Label htmlFor={`${id}-n`}>Note (optional)</Label>
            <Textarea
              id={`${id}-n`}
              name="note"
              rows={2}
              maxLength={140}
              placeholder="Let's go after lectures?"
              invalid={Boolean(e.note)}
            />
            {e.note && <FieldError>{e.note}</FieldError>}
          </div>
          <FormMessage state={state} />
          <SubmitButton className="w-full rounded-full">Send</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReportStudentForm({ userId, chatId }: { userId: string; chatId?: string }) {
  const [state, action] = useActionState(reportStudent, idleState);
  const id = useId();
  const e = state.fieldErrors ?? {};
  if (state.status === "success") {
    return (
      <p role="status" className="rounded-3xl bg-emerald-50 p-4 text-[0.9375rem] font-medium text-emerald-800">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      {chatId && <input type="hidden" name="chatId" value={chatId} />}
      <div>
        <Label htmlFor={`${id}-r`}>What happened?</Label>
        <NativeSelect id={`${id}-r`} name="reason" defaultValue="" invalid={Boolean(e.reason)}>
          <option value="" disabled>
            Choose one
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
        <Label htmlFor={`${id}-n`}>Details (optional)</Label>
        <Textarea id={`${id}-n`} name="note" rows={4} maxLength={500} invalid={Boolean(e.note)} />
        {e.note && <FieldError>{e.note}</FieldError>}
      </div>
      <label className="flex items-center gap-3 text-[0.9375rem] font-medium text-ink-900">
        <input type="checkbox" name="block" defaultChecked className="size-5 accent-blue-500" />
        Also block this student
      </label>
      {chatId && <p className="text-sm text-ink-600">Perqly support will see the recent messages in your chat with them.</p>}
      <FormMessage state={state} />
      <SubmitButton className="rounded-full">Send report</SubmitButton>
    </form>
  );
}

export function StudentReportStatusForm({ reportId, status }: { reportId: string; status: string }) {
  const [state, action] = useActionState(setStudentReportStatus, idleState);
  const id = useId();
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="reportId" value={reportId} />
      <div>
        <Label htmlFor={`${id}-s`}>Status</Label>
        <NativeSelect id={`${id}-s`} name="status" defaultValue={status}>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </NativeSelect>
      </div>
      <div>
        <Label htmlFor={`${id}-n`}>Note for the team (optional)</Label>
        <Textarea id={`${id}-n`} name="staffNote" rows={3} maxLength={500} invalid={Boolean(state.fieldErrors?.staffNote)} />
        {state.fieldErrors?.staffNote && <FieldError>{state.fieldErrors.staffNote}</FieldError>}
      </div>
      <FormMessage state={state} />
      <SubmitButton size="sm">Save</SubmitButton>
    </form>
  );
}
