import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
      <Logo />
      <p className="mt-12 font-display text-8xl font-extrabold text-blue-500">404</p>
      <h1 className="mt-4 font-display text-display-md font-extrabold">This page doesn&apos;t exist.</h1>
      <p className="mt-4 max-w-sm text-lg text-ink-600">Check the address, or head back to the home page.</p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/">Go to the home page</Link>
      </Button>
    </main>
  );
}
