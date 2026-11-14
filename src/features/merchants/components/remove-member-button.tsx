"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { removeTeamMember } from "../actions";

/** Two clicks: the first asks, the second removes. */
export function RemoveMemberButton({ memberId, name }: { memberId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Remove ${name}`}>
        Remove
      </Button>
    );
  }
  return (
    <form action={removeTeamMember} className="flex items-center gap-1">
      <input type="hidden" name="memberId" value={memberId} />
      <span className="mr-1 text-sm text-ink-700">Remove {name}?</span>
      <SubmitButton variant="secondary" size="sm">
        Yes, remove
      </SubmitButton>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </form>
  );
}
