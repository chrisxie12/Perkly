import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Logo, LogoMark } from "@/components/shared/logo";
import { EmptyState, ErrorState, LoadingIndicator } from "@/components/shared/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DAY_COLOURS } from "@/lib/day-colour";

export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };

const swatches = [
  { name: "Perqly Blue", value: "#0066FF", className: "bg-blue-500", text: "text-white" },
  { name: "Perk Orange", value: "#FF6B35", className: "bg-orange-500", text: "text-ink-900" },
  { name: "Ink", value: "#1F2937", className: "bg-ink-900", text: "text-white" },
  { name: "Paper", value: "#F8FAFC", className: "bg-paper ring-1 ring-ink-200", text: "text-ink-900" },
  { name: "White", value: "#FFFFFF", className: "bg-white ring-1 ring-ink-200", text: "text-ink-900" },
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink-200 py-12">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Internal reference for the Perqly design system. Not linked anywhere. */
export default function DesignPage() {
  return (
    <main className="py-16">
      <PageContainer>
        <Logo />
        <h1 className="mt-8 font-display text-display-lg font-extrabold">Perqly design system</h1>

        <Block title="Colour">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {swatches.map((s) => (
              <div key={s.name} className={`flex h-32 flex-col justify-end rounded-xl p-4 ${s.className} ${s.text}`}>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm opacity-80">{s.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 font-semibold">Live pass: colour of the day</p>
          <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-7">
            {DAY_COLOURS.map((d) => (
              <div key={d.day} className="rounded-lg p-3 text-sm font-semibold" style={{ backgroundColor: d.hex, color: d.ink }}>
                {d.day}
              </div>
            ))}
          </div>
        </Block>

        <Block title="Type">
          <p className="font-display text-display-xl font-extrabold">Display XL</p>
          <p className="mt-4 font-display text-display-lg font-extrabold">Display large</p>
          <p className="mt-4 font-display text-display-md font-extrabold">Display medium</p>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-700">
            Body text is Figtree. Headlines are Bricolage Grotesque, set tight and heavy. Keep lines under about 75 characters.
          </p>
        </Block>

        <Block title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button loading>Saving</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 rounded-xl bg-blue-500 p-5">
            <Button variant="inverse">Inverse</Button>
            <Button variant="outline-inverse">Outline inverse</Button>
            <Button variant="accent">Accent on blue</Button>
          </div>
        </Block>

        <Block title="Inputs">
          <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
            <div>
              <Label htmlFor="d-email">School email</Label>
              <Input id="d-email" type="email" placeholder="you@school.edu.gh" />
              <FieldHint>We&apos;ll send a 6-digit code to this address.</FieldHint>
            </div>
            <div>
              <Label htmlFor="d-id">Student ID number</Label>
              <Input id="d-id" invalid defaultValue="12" aria-describedby="d-id-error" />
              <FieldError id="d-id-error">Enter your full student ID number.</FieldError>
            </div>
          </div>
        </Block>

        <Block title="Cards, badges, avatars">
          <div className="grid gap-5 md:grid-cols-3">
            <Card>
              <CardTitle>Card title</CardTitle>
              <CardDescription>Cards hold one idea each. Use them for content that stands alone.</CardDescription>
            </Card>
            <div className="flex flex-wrap content-start gap-2">
              <Badge>Blue</Badge>
              <Badge variant="orange">Orange</Badge>
              <Badge variant="ink">Ink</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="success">Verified</Badge>
            </div>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>AK</AvatarFallback>
              </Avatar>
              <Avatar className="size-14">
                <AvatarFallback className="text-lg">KM</AvatarFallback>
              </Avatar>
              <LogoMark className="size-14" />
            </div>
          </div>
        </Block>

        <Block title="States">
          <div className="grid gap-5 md:grid-cols-3">
            <EmptyState
              icon={<Inbox />}
              title="No saved deals yet"
              description="Tap the heart on any deal to keep it here."
              action={<Button size="sm">Browse deals</Button>}
            />
            <ErrorState
              title="Couldn't load deals"
              description="Check your connection and try again."
              action={<Button size="sm">Try again</Button>}
            />
            <div className="space-y-4 rounded-xl bg-white p-6 ring-1 ring-ink-200">
              <LoadingIndicator label="Loading deals" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          </div>
        </Block>
      </PageContainer>
    </main>
  );
}
