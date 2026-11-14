/** Turns Supabase Auth error codes into plain messages. Never shows raw server text. */
export function authErrorMessage(code: string | undefined, fallback = "Something went wrong. Try again in a moment."): string {
  switch (code) {
    case "otp_expired":
      return "That code is wrong or has expired. Check the latest email, or send a new code.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Wait a minute, then try again.";
    case "email_address_invalid":
    case "validation_failed":
      return "Enter a valid email address.";
    case "email_address_not_authorized":
      return "This test environment can only email Perqly team members.";
    case "signup_disabled":
      return "New sign-ups are paused right now. Try again later.";
    case "user_banned":
      return "This account can't sign in. Contact Perqly support.";
    case "mfa_verification_failed":
    case "mfa_challenge_expired":
      return "That authenticator code didn't work. Enter the current 6-digit code from your app.";
    case "mfa_factor_not_found":
      return "Your authenticator setup expired. Start again.";
    default:
      return fallback;
  }
}

/** Errors that mean "no account with that email" when signing in. Shown as success to avoid revealing accounts. */
export function isUnknownAccountError(code: string | undefined): boolean {
  return code === "otp_disabled" || code === "signup_disabled" || code === "user_not_found";
}
