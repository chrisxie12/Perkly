import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Inbox, Plus, Search } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/states";
import { listInstitutionRequests, listInstitutions, type InstitutionRow } from "@/features/admin/queries";
import { InstitutionLogo } from "@/features/institutions/logo";
import { institutionLogoUrl } from "@/features/institutions/logo-url";
import { getUserContext } from "@/lib/auth/session";
import { canManagePlatform } from "@/lib/auth/roles";
import { getPublicEnv, hasSupabaseEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Institutions", robots: { index: false, follow: false } };

const statusBadge = {
  active: { label: "Active", variant: "success" },
  pilot: { label: "Pilot", variant: "blue" },
  inactive: { label: "Hidden", variant: "outline" },
} as const;

const accreditationBadge = {
  confirmed: { label: "GTEC confirmed", variant: "success" },
  unverified: { label: "GTEC not checked", variant: "orange" },
  not_found: { label: "Not on GTEC", variant: "orange" },
  closed: { label: "Closed", variant: "outline" },
} as const;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function matches(row: InstitutionRow, q: string, type: string, region: string, status: string) {
  if (type && row.institution_type !== type) return false;
  if (region && row.region !== region) return false;
  if (status && row.status !== status) return false;
  if (!q) return true;
  const hay = `${row.name} ${row.short_name} ${row.city ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

export default async function InstitutionsPage({ searchParams }: PageProps<"/admin/institutions">) {
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 80);
  const type = ["public", "private"].includes(one(sp.type)) ? one(sp.type) : "";
  const status = ["active", "pilot", "inactive"].includes(one(sp.status)) ? one(sp.status) : "";
  const region = one(sp.region).slice(0, 60);

  const [institutions, requests, ctx] = await Promise.all([listInstitutions(), listInstitutionRequests("pending"), getUserContext()]);
  const canManage = Boolean(ctx && canManagePlatform(ctx));
  const supabaseUrl = hasSupabaseEnv() ? getPublicEnv().NEXT_PUBLIC_SUPABASE_URL : null;
  const regions = [...new Set(institutions.map((r) => r.region).filter((r): r is string => Boolean(r)))].sort();
  const rows = institutions.filter((r) => matches(r, q, type, region, status));
  const filtered = Boolean(q || type || region || status);

  return (
    <AreaShell area="admin">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle
          title="Institutions"
          description="Students can only choose institutions marked Pilot or Active, and only after GTEC accreditation is recorded."
        />
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/institutions/requests" className={buttonVariants({ variant: "secondary" })}>
            <Inbox aria-hidden /> Requests{requests.length > 0 && <Badge variant="orange">{requests.length}</Badge>}
          </Link>
          {canManage && (
            <Link href="/admin/institutions/new" className={buttonVariants()}>
              <Plus aria-hidden /> Add institution
            </Link>
          )}
        </div>
      </div>

      <form role="search" className="mt-2 mb-6 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search institutions</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-500" aria-hidden />
            <Input name="q" type="search" defaultValue={q} placeholder="Search name or city" className="pl-12" />
          </label>
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            Filter
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:flex">
          <NativeSelect name="type" defaultValue={type} aria-label="Type">
            <option value="">Type</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </NativeSelect>
          <NativeSelect name="region" defaultValue={region} aria-label="Region">
            <option value="">Region</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect name="status" defaultValue={status} aria-label="Status">
            <option value="">Status</option>
            <option value="active">Active</option>
            <option value="pilot">Pilot</option>
            <option value="inactive">Hidden</option>
          </NativeSelect>
        </div>
      </form>

      {institutions.length === 0 ? (
        <EmptyState icon={<Building2 />} title="No institutions yet" description="Add the first one to open Perqly to its students." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No institutions match"
          description="Try a shorter search or clear the filters."
          action={
            <Link href="/admin/institutions" className={buttonVariants({ variant: "secondary" })}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-600" aria-live="polite">
            {filtered ? `${rows.length} of ${institutions.length}` : `${institutions.length}`} institutions
          </p>

          {/* Phones: cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/admin/institutions/${row.id}`}
                  className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-200/70 active:bg-ink-50"
                >
                  <InstitutionLogo src={institutionLogoUrl(supabaseUrl, row.logo_path)} name={row.name} shortName={row.short_name} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink-900">{row.name}</span>
                    <span className="block text-sm text-ink-600">
                      {[row.institution_type === "public" ? "Public" : row.institution_type === "private" ? "Private" : null, row.city]
                        .filter(Boolean)
                        .join(", ") || "Details not set"}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant={statusBadge[row.status].variant}>{statusBadge[row.status].label}</Badge>
                      <Badge variant={accreditationBadge[row.accreditation_status].variant}>
                        {accreditationBadge[row.accreditation_status].label}
                      </Badge>
                      {row.logo_status === "pending" && <Badge variant="outline">Logo pending</Badge>}
                    </span>
                  </span>
                  <ArrowRight className="size-5 shrink-0 text-blue-500" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-ink-200/70 md:block">
            <table className="w-full text-left text-[0.9375rem]">
              <thead className="border-b border-ink-200 bg-ink-50 text-sm text-ink-600">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Institution
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Location
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Accreditation
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Logo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-ink-50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/institutions/${row.id}`}
                        className="flex items-center gap-3 font-semibold text-ink-900 hover:text-blue-700"
                      >
                        <InstitutionLogo
                          src={institutionLogoUrl(supabaseUrl, row.logo_path)}
                          name={row.name}
                          shortName={row.short_name}
                          size="sm"
                        />
                        <span>
                          {row.name}
                          <span className="block text-sm font-normal text-ink-600">{row.short_name}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {row.institution_type === "public" ? "Public" : row.institution_type === "private" ? "Private" : "Not set"}
                    </td>
                    <td className="px-4 py-3 text-ink-700">{[row.city, row.region].filter(Boolean).join(", ") || "Not set"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadge[row.status].variant}>{statusBadge[row.status].label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={accreditationBadge[row.accreditation_status].variant}>
                        {accreditationBadge[row.accreditation_status].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{row.logo_status === "official" ? "Official" : "Pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AreaShell>
  );
}
