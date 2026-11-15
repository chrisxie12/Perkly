"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Check, MapPin, Search } from "lucide-react";
import { FieldError, FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { InstitutionLogo } from "@/features/institutions/logo";
import { institutionLogoUrl } from "@/features/institutions/logo-url";
import { requestInstitution, saveStudentProfile } from "../actions";
import { LEVELS } from "../schemas";
import type { CampusOption, InstitutionOption } from "../queries";

type Initial = {
  institutionId?: string;
  campusId?: string | null;
  programme?: string | null;
  level?: string | null;
  gradYear?: number | null;
};

const CAMPUS_TYPE: Record<CampusOption["campus_type"], string> = {
  main: "Main campus",
  satellite: "Campus",
  city: "City campus",
  learning_centre: "Learning centre",
};

function StepTitle({ n, children, id }: { n: number; children: React.ReactNode; id: string }) {
  return (
    <h3 id={id} className="mb-3 flex items-center gap-2.5 font-display text-lg font-bold text-ink-900">
      <span className="grid size-7 place-items-center rounded-full bg-blue-500 text-sm font-bold text-white" aria-hidden>
        {n}
      </span>
      {children}
    </h3>
  );
}

export function NotListed() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(requestInstitution, idleState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <div className="rounded-2xl bg-ink-50 p-4">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-left font-semibold text-blue-700 underline-offset-2 hover:underline"
        >
          My school isn&apos;t listed
        </button>
      ) : (
        <form action={action} noValidate className="space-y-3">
          <p className="text-[0.9375rem] text-ink-700">
            Tell us your school. We check its accreditation and campuses before adding it, so it won&apos;t appear straight away.
          </p>
          <div>
            <Label htmlFor="req-name">School name</Label>
            <Input id="req-name" name="institutionName" invalid={Boolean(state.fieldErrors?.institutionName)} />
            {state.fieldErrors?.institutionName && <FieldError>{state.fieldErrors.institutionName}</FieldError>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="req-campus">Campus (optional)</Label>
              <Input id="req-campus" name="campusName" />
            </div>
            <div>
              <Label htmlFor="req-city">Town or city (optional)</Label>
              <Input id="req-city" name="city" />
            </div>
          </div>
          <FormMessage state={state} />
          <SubmitButton variant="secondary" size="md">
            Send request
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export function StudentProfileForm({
  institutions,
  campuses,
  initial,
  lockReason,
  currentYear,
  supabaseUrl,
}: {
  institutions: InstitutionOption[];
  campuses: CampusOption[];
  initial: Initial;
  lockReason: "open_application" | "verified" | null;
  currentYear: number;
  supabaseUrl: string | null;
}) {
  const institutionLocked = lockReason !== null;
  const [state, action] = useActionState(saveStudentProfile, idleState);
  const [institutionId, setInstitutionId] = useState(initial.institutionId ?? (institutions.length === 1 ? institutions[0].id : ""));
  const [campusId, setCampusId] = useState(initial.campusId ?? "");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "public" | "private">("all");
  const errors = state.fieldErrors ?? {};

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return institutions.filter(
      (i) =>
        (type === "all" || i.institution_type === type) &&
        (!q || i.name.toLowerCase().includes(q) || i.short_name.toLowerCase().includes(q) || (i.city ?? "").toLowerCase().includes(q)),
    );
  }, [institutions, query, type]);
  const chosen = institutions.find((i) => i.id === institutionId);
  // Only this institution's campuses: a student can never pick another school's campus.
  const schoolCampuses = campuses.filter((c) => c.institution_id === institutionId);
  const types = new Set(institutions.map((i) => i.institution_type).filter(Boolean));

  return (
    <form action={action} noValidate className="space-y-8">
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="campusId" value={schoolCampuses.some((c) => c.id === campusId) ? campusId : ""} />

      <section aria-labelledby="step-school">
        <StepTitle n={1} id="step-school">
          Your school
        </StepTitle>
        {institutionLocked && chosen ? (
          <div className="flex items-center gap-3 rounded-2xl bg-ink-50 p-3">
            <InstitutionLogo src={institutionLogoUrl(supabaseUrl, chosen.logo_path)} name={chosen.name} shortName={chosen.short_name} />
            <span className="min-w-0">
              <span className="block font-semibold text-ink-900">{chosen.name}</span>
              <span className="text-sm text-ink-600">{[chosen.city, chosen.region].filter(Boolean).join(", ")}</span>
            </span>
          </div>
        ) : (
          <>
            {institutions.length > 4 && (
              <div className="mb-3 space-y-3">
                <label className="relative block">
                  <span className="sr-only">Search schools</span>
                  <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-500" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name, short name or town"
                    className="h-12 w-full rounded-full bg-white pr-4 pl-11 text-base ring-1 ring-ink-300 outline-none ring-inset focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                </label>
                {types.size > 1 && (
                  <div className="flex gap-2" role="group" aria-label="Type of school">
                    {(["all", "public", "private"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={type === t}
                        onClick={() => setType(t)}
                        className={cn(
                          "rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-inset",
                          type === t ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-800 ring-ink-200",
                        )}
                      >
                        {t === "all" ? "All" : t === "public" ? "Public" : "Private"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <ul
              role="radiogroup"
              aria-labelledby="step-school"
              aria-describedby={errors.institutionId ? "institutionId-error" : undefined}
              className="space-y-2"
            >
              {shown.map((i) => {
                const selected = i.id === institutionId;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setInstitutionId(i.id);
                        const primary = campuses.find((c) => c.institution_id === i.id && c.is_primary);
                        setCampusId(primary?.id ?? "");
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 transition-shadow ring-inset",
                        selected ? "ring-2 ring-blue-500" : "ring-ink-200 hover:ring-ink-300",
                      )}
                    >
                      <InstitutionLogo src={institutionLogoUrl(supabaseUrl, i.logo_path)} name={i.name} shortName={i.short_name} />
                      <span className="min-w-0 flex-1">
                        <span className="block leading-snug font-semibold text-ink-900">{i.name}</span>
                        <span className="block text-sm text-ink-600">
                          {[
                            i.short_name,
                            [i.city, i.region].filter(Boolean).join(", "),
                            i.institution_type === "public" ? "Public" : i.institution_type === "private" ? "Private" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-full",
                          selected ? "bg-blue-500 text-white" : "ring-1 ring-ink-300",
                        )}
                        aria-hidden
                      >
                        {selected && <Check className="size-4" strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                );
              })}
              {shown.length === 0 && <li className="rounded-2xl bg-ink-50 p-4 text-ink-700">No school matches “{query}”.</li>}
            </ul>
            {errors.institutionId && <FieldError id="institutionId-error">{errors.institutionId}</FieldError>}
          </>
        )}
        {lockReason === "open_application" && (
          <FieldHint>
            You have an open verification application, so your school is fixed for now. To change it,{" "}
            <Link href="/student/verify" className="font-semibold text-blue-600 underline underline-offset-2">
              withdraw the application
            </Link>{" "}
            first.
          </FieldHint>
        )}
        {lockReason === "verified" && (
          <FieldHint>You&apos;re verified with this school. You can change it after your verification ends.</FieldHint>
        )}
      </section>

      {institutionId && (
        <section aria-labelledby="step-campus">
          <StepTitle n={2} id="step-campus">
            Your campus
          </StepTitle>
          {schoolCampuses.length === 0 ? (
            <p className="text-ink-700">No campuses listed yet for this school. You can still continue.</p>
          ) : (
            <ul role="radiogroup" aria-labelledby="step-campus" className="grid gap-2 sm:grid-cols-2">
              {[...schoolCampuses, null].map((c) => {
                const value = c?.id ?? "";
                const selected = campusId === value;
                return (
                  <li key={value || "other"}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setCampusId(value)}
                      className={cn(
                        "flex h-full w-full items-start gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-inset",
                        selected ? "ring-2 ring-blue-500" : "ring-ink-200 hover:ring-ink-300",
                      )}
                    >
                      <MapPin className={cn("mt-0.5 size-5 shrink-0", selected ? "text-blue-600" : "text-ink-400")} aria-hidden />
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink-900">{c ? c.name : "Not sure / other"}</span>
                        {c && (
                          <span className="block text-sm text-ink-600">
                            {[CAMPUS_TYPE[c.campus_type], c.address].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {institutionId && (
        <section aria-labelledby="step-programme" className="space-y-5">
          <StepTitle n={3} id="step-programme">
            Your programme
          </StepTitle>
          <div>
            <Label htmlFor="programme">Programme</Label>
            <Input
              id="programme"
              name="programme"
              defaultValue={initial.programme ?? ""}
              placeholder="As it appears on your student ID, e.g. BSc Computer Science"
              invalid={Boolean(errors.programme)}
            />
            {errors.programme && <FieldError>{errors.programme}</FieldError>}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="level">Level</Label>
              <NativeSelect id="level" name="level" defaultValue={initial.level ?? ""}>
                <option value="">Choose</option>
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="gradYear">Expected graduation year</Label>
              <NativeSelect id="gradYear" name="gradYear" defaultValue={initial.gradYear?.toString() ?? ""}>
                <option value="">Choose</option>
                {Array.from({ length: 8 }, (_, i) => currentYear + i).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </section>
      )}

      <FormMessage state={state} />
      <SubmitButton disabled={!institutionId}>Save school details</SubmitButton>
    </form>
  );
}
