"use client";

import { startTransition, useOptimistic, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setFollow } from "../actions";

export function FollowButton({ organisationId, following, name }: { organisationId: string; following: boolean; name: string }) {
  const [shown, setShown] = useOptimistic(following);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        type="button"
        variant={shown ? "secondary" : "primary"}
        aria-pressed={shown}
        aria-label={shown ? `Unfollow ${name}` : `Follow ${name}`}
        onClick={() =>
          startTransition(async () => {
            const next = !shown;
            setShown(next);
            const r = await setFollow(organisationId, next);
            setError(r.ok ? null : r.message);
          })
        }
      >
        {shown ? <Check aria-hidden /> : <Plus aria-hidden />} {shown ? "Following" : "Follow"}
      </Button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
