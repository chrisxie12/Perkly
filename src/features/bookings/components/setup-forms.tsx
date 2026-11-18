"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { FieldError, FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { addClosedDay, saveHours } from "../actions";
import { WEEKDAYS } from "../schemas";

type Option = { id: string; name: string };

function useResetOnSuccess(status: string) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (status === "success") ref.current?.reset();
  }, [status]);
  return ref;
}

export function HoursForm({ branches, services }: { branches: Option[]; services: (Option & { duration_minutes: number | null })[] }) {
  const [state, action] = useActionState(saveHours, idleState);
  const e = state.fieldErrors ?? {};
  const ref = useResetOnSuccess(state.status);
  const id = useId();
  return (
    <form ref={ref} action={action} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-s`}>Service</Label>
          <NativeSelect id={`${id}-s`} name="serviceId" defaultValue="" invalid={Boolean(e.serviceId)}>
            <option value="" disabled>
              Choose a service
            </option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          {e.serviceId && <FieldError>{e.serviceId}</FieldError>}
        </div>
        <div>
          <Label htmlFor={`${id}-b`}>Branch</Label>
          <NativeSelect id={`${id}-b`} name="branchId" defaultValue="" invalid={Boolean(e.branchId)}>
            <option value="" disabled>
              Choose a branch
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
          {e.branchId && <FieldError>{e.branchId}</FieldError>}
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 font-medium text-ink-900">Days</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-ink-200">
              <input type="checkbox" name="weekday" value={i} className="size-5 accent-blue-500" />
              {d.slice(0, 3)}
            </label>
          ))}
        </div>
        {e.weekdays && <FieldError>{e.weekdays}</FieldError>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <Label htmlFor={`${id}-o`}>Opens</Label>
          <Input id={`${id}-o`} name="start" type="time" invalid={Boolean(e.start)} />
          {e.start && <FieldError>{e.start}</FieldError>}
        </div>
        <div>
          <Label htmlFor={`${id}-c`}>Closes</Label>
          <Input id={`${id}-c`} name="end" type="time" invalid={Boolean(e.end)} />
          {e.end && <FieldError>{e.end}</FieldError>}
        </div>
        <div>
          <Label htmlFor={`${id}-l`}>Slot (minutes)</Label>
          <Input
            id={`${id}-l`}
            name="slotMinutes"
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            defaultValue={30}
            invalid={Boolean(e.slotMinutes)}
          />
          {e.slotMinutes && <FieldError>{e.slotMinutes}</FieldError>}
        </div>
        <div>
          <Label htmlFor={`${id}-p`}>Students per slot</Label>
          <Input
            id={`${id}-p`}
            name="capacity"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            defaultValue={1}
            invalid={Boolean(e.capacity)}
          />
          {e.capacity && <FieldError>{e.capacity}</FieldError>}
        </div>
      </div>
      <SubmitButton size="sm">Add hours</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ClosedDayForm({ branches, services }: { branches: Option[]; services: Option[] }) {
  const [state, action] = useActionState(addClosedDay, idleState);
  const e = state.fieldErrors ?? {};
  const ref = useResetOnSuccess(state.status);
  const id = useId();
  return (
    <form ref={ref} action={action} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor={`${id}-d`}>Date</Label>
          <Input id={`${id}-d`} name="date" type="date" invalid={Boolean(e.date)} />
          {e.date && <FieldError>{e.date}</FieldError>}
        </div>
        <div>
          <Label htmlFor={`${id}-b`}>Branch</Label>
          <NativeSelect id={`${id}-b`} name="branchId" defaultValue="" invalid={Boolean(e.branchId)}>
            <option value="" disabled>
              Choose a branch
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
          {e.branchId && <FieldError>{e.branchId}</FieldError>}
        </div>
        <div>
          <Label htmlFor={`${id}-s`}>Service</Label>
          <NativeSelect id={`${id}-s`} name="serviceId" defaultValue="">
            <option value="">All bookable services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div>
        <Label htmlFor={`${id}-r`}>Reason (optional)</Label>
        <Input id={`${id}-r`} name="reason" maxLength={200} placeholder="e.g. Public holiday" />
        <FieldHint>Students only see that the day is unavailable.</FieldHint>
      </div>
      <input type="hidden" name="closed" value="1" />
      <SubmitButton size="sm">Close that day</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
