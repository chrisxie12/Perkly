"use client";

import { useActionState } from "react";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { saveNotificationSettings } from "../actions";

export type CategorySetting = { category: string; label: string; description: string; push: boolean; email: boolean };

function Switch({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className="h-7 w-12 rounded-full bg-ink-300 transition-colors peer-checked:bg-green-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2"
      />
      <span
        aria-hidden
        className="absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"
      />
    </label>
  );
}

export function NotificationSettingsForm({ settings }: { settings: CategorySetting[] }) {
  const [state, action] = useActionState(saveNotificationSettings, idleState);
  return (
    <form action={action} className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-ink-200/70">
        <div className="grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-3 border-b border-ink-200 bg-ink-50 px-5 py-2 text-sm font-medium text-ink-600">
          <span>Notify me about</span>
          <span className="text-center">Phone</span>
          <span className="text-center">Email</span>
        </div>
        <ul className="divide-y divide-ink-200">
          {settings.map((s) => (
            <li key={s.category} className="grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-3 px-5 py-4">
              <input type="hidden" name="category" value={s.category} />
              <span className="min-w-0">
                <span className="block font-semibold text-ink-900">{s.label}</span>
                <span className="block text-sm text-ink-600">{s.description}</span>
              </span>
              <span className="grid place-items-center">
                <Switch name={`${s.category}:push`} label={`${s.label} on your phone`} defaultChecked={s.push} />
              </span>
              <span className="grid place-items-center">
                <Switch name={`${s.category}:email`} label={`${s.label} by email`} defaultChecked={s.email} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-ink-600">Everything always shows in your notifications here, whatever you choose.</p>
      <FormMessage state={state} />
      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}
