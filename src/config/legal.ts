/**
 * The version of the Terms of use and Privacy notice that sign-up asks people to accept.
 * Recorded on the account by public.accept_terms() when someone creates an account.
 *
 * Change this whenever either document changes in substance. While the documents are
 * drafts (operator details, Data Protection Commission registration and legal review are
 * still pending), the version ends in "-draft".
 */
export const TERMS_VERSION = "2026-11-24-draft";

/** True while the legal pages are drafts and must say so. */
export const LEGAL_PAGES_ARE_DRAFTS = TERMS_VERSION.endsWith("-draft");
