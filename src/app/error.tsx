"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Reported to the console for now; error monitoring (Sentry) comes later.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-5">
      <ErrorState
        className="w-full max-w-md"
        title="This page didn't load."
        description="Something went wrong on our side. Try again, and if it keeps happening, come back in a few minutes."
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => retry()}>Try again</Button>
            <Button asChild variant="secondary">
              <Link href="/">Go home</Link>
            </Button>
          </div>
        }
      />
    </main>
  );
}
