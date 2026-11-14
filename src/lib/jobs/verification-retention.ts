import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "verification-documents";

type DueApplication = { application_id: string; student_id: string; institution_id: string };

export type RetentionResult = { due: number; deleted: number; failed: number };

/**
 * Deletes verification photos 30 days after a decision (or withdrawal).
 *
 * Storage files can only be removed through the Storage API, so this lists
 * what the database says is due, removes everything in each application's
 * folder (including any replaced uploads), and only then asks the database to
 * mark those applications. An application whose files couldn't be removed is
 * left unmarked and retried on the next run.
 */
export async function purgeVerificationDocuments(admin: SupabaseClient, batchSize = 100): Promise<RetentionResult> {
  const { data, error } = await admin.rpc("list_verification_documents_due", { p_limit: batchSize });
  if (error) throw new Error(`list_verification_documents_due failed: ${error.message}`);
  const due = (data ?? []) as DueApplication[];

  const cleared: string[] = [];
  let failed = 0;
  for (const application of due) {
    const folder = `${application.student_id}/${application.application_id}`;
    const listing = await admin.storage.from(BUCKET).list(folder, { limit: 100 });
    if (listing.error) {
      failed += 1;
      continue;
    }
    const paths = (listing.data ?? []).filter((item) => item.name && item.id !== null).map((item) => `${folder}/${item.name}`);
    if (paths.length > 0) {
      const removal = await admin.storage.from(BUCKET).remove(paths);
      if (removal.error) {
        failed += 1;
        continue;
      }
    }
    cleared.push(application.application_id);
  }

  let deleted = 0;
  if (cleared.length > 0) {
    const { data: marked, error: markError } = await admin.rpc("mark_verification_documents_deleted", { p_application_ids: cleared });
    if (markError) throw new Error(`mark_verification_documents_deleted failed: ${markError.message}`);
    deleted = (marked as number | null) ?? 0;
  }
  return { due: due.length, deleted, failed };
}
