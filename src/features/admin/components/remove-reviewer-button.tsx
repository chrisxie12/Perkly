"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { removeReviewer } from "../actions";

/** Removing a reviewer takes two clicks: the first asks, the second removes. */
export function RemoveReviewerButton({ institutionId, reviewerId, name }: { institutionId: string; reviewerId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Remove ${name}`}>
        Remove
      </Button>
    );
  }
  return (
    <form action={removeReviewer} className="flex items-center gap-1">
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="reviewerId" value={reviewerId} />
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
