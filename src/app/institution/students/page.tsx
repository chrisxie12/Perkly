import type { Metadata } from "next";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/states";
import { cn } from "@/lib/utils";
import { getInstitutionStudents, getReviewableInstitutions } from "@/features/institutions/queries";
import { formatDate } from "@/features/students/components/status-card";

export const metadata: Metadata = { title: "Students", robots: { index: false } };

const STATES = [
  ["verified", "Verified"],
  ["expired", "Lapsed"],
  ["all", "All"],
] as const;

export default async function InstitutionStudentsPage({ searchParams }: PageProps<"/institution/students">) {
  const [params, reviewable] = await Promise.all([searchParams, getReviewableInstitutions()]);
  const chosen = reviewable.find((r) => r.institution_id === params.school) ?? reviewable[0];
  const state = STATES.find(([v]) => v === params.state)?.[0] ?? "verified";
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const students = chosen ? await getInstitutionStudents(chosen.institution_id, q || undefined, state) : [];
  const link = (next: Record<string, string>) =>
    `/institution/students?${new URLSearchParams({ ...(chosen ? { school: chosen.institution_id } : {}), state, ...(q ? { q } : {}), ...next })}`;

  return (
    <AreaShell area="institution">
      <PageTitle title="Students" description="Students your institution has verified. Names and study details only; no contact details." />
      {!chosen ? (
        <p className="text-ink-700">You can&apos;t review any institution at the moment.</p>
      ) : (
        <>
          {reviewable.length > 1 && (
            <nav aria-label="Institution" className="mb-4 flex flex-wrap gap-2">
              {reviewable.map((r) => (
                <Link
                  key={r.institution_id}
                  href={`/institution/students?school=${r.institution_id}&state=${state}`}
                  aria-current={r.institution_id === chosen.institution_id ? "page" : undefined}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold ring-1",
                    r.institution_id === chosen.institution_id
                      ? "bg-ink-900 text-white ring-ink-900"
                      : "bg-white text-ink-700 ring-ink-200",
                  )}
                >
                  {r.short_name}
                </Link>
              ))}
            </nav>
          )}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <nav aria-label="Status" className="flex gap-2">
              {STATES.map(([value, label]) => (
                <Link
                  key={value}
                  href={link({ state: value })}
                  aria-current={state === value ? "page" : undefined}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold ring-1",
                    state === value ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-ink-700 ring-ink-200",
                  )}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <form role="search" className="flex w-full gap-2 sm:w-auto sm:min-w-64 sm:flex-1">
              <input type="hidden" name="school" value={chosen.institution_id} />
              <input type="hidden" name="state" value={state} />
              <label htmlFor="q" className="sr-only">
                Name or programme
              </label>
              <Input id="q" name="q" defaultValue={q} placeholder="Name or programme" className="flex-1" />
              <Button type="submit" variant="secondary" size="lg" aria-label="Search">
                <Search aria-hidden />
              </Button>
            </form>
          </div>
          {students.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="No students here"
              description={q ? "Try another name or programme." : "Students appear here once your reviewers approve them."}
            />
          ) : (
            <>
              <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70 sm:hidden">
                {students.map((s) => (
                  <li key={s.student_id} className="p-4">
                    <p className="font-semibold text-ink-900">{s.full_name ?? "No name"}</p>
                    <p className="text-sm text-ink-700">
                      {[s.programme, s.level, s.campus].filter(Boolean).join(", ") || "Programme not given"}
                    </p>
                    <p className="mt-1 text-sm text-ink-600">
                      Verified {formatDate(s.verified_at)}, until {formatDate(s.verified_until)}
                      {s.state === "expired" ? " (lapsed)" : ""}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70 sm:block">
                <table className="w-full min-w-[40rem] text-left text-[0.9375rem]">
                  <thead className="border-b border-ink-200 text-sm text-ink-600">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">
                        Student
                      </th>
                      <th scope="col" className="px-5 py-3 font-semibold">
                        Programme
                      </th>
                      <th scope="col" className="px-5 py-3 font-semibold">
                        Verified
                      </th>
                      <th scope="col" className="px-5 py-3 font-semibold">
                        Until
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200">
                    {students.map((s) => (
                      <tr key={s.student_id}>
                        <td className="px-5 py-3 font-semibold text-ink-900">{s.full_name ?? "No name"}</td>
                        <td className="px-5 py-3 text-ink-700">
                          {[s.programme, s.level, s.campus].filter(Boolean).join(", ") || "Not given"}
                        </td>
                        <td className="px-5 py-3 text-ink-700">{formatDate(s.verified_at)}</td>
                        <td className="px-5 py-3 text-ink-700">
                          {formatDate(s.verified_until)}
                          {s.state === "expired" ? " (lapsed)" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {students.length === 300 && <p className="mt-3 text-sm text-ink-600">Showing the first 300. Search to narrow the list.</p>}
            </>
          )}
        </>
      )}
    </AreaShell>
  );
}
