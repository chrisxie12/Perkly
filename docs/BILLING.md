# Business billing (D18)

Businesses pay Perqly a monthly subscription. Students never pay Perqly, and
Perqly takes no cut of sales.

## How it works

- **Off by default.** While off, every business uses Perqly free (the pilot, D9).
- **Free month.** A business approved while billing is on gets its first month free from approval. When you switch billing on, every business already approved gets its free month from that day.
- **Reminders.** 7 days before the free month ends, then on the day cover runs out. Owners and managers get them in the app, on their phone and (if they chose) by email. Cashiers don't.
- **Grace, then pause.** If cover runs out, the business has the grace period (7 days by default) to pay. After that, its live deals are paused and it can't put deals live again until it pays. Paying brings the paused deals back at once.
- **Paying.** Owners and managers pay in Business → Billing, on Paystack's checkout (mobile money or card). Each payment adds a month from today or from the end of current cover, whichever is later.
- **Other ways to pay.** In Admin → Merchants → (business) → Billing, an admin records cash, bank or MoMo payments. The business is told.
- **Switching off** lifts every hold and puts paused deals back.

Everything is logged in the audit log.

## Set up Paystack (once)

1. Create a Paystack account at paystack.com (Ghana). Until it's activated, you can test with test keys and no real money.
2. In Paystack → Settings → API Keys & Webhooks:
   - Copy the **Secret key**. Use `sk_test_...` for testing; switch to `sk_live_...` after activation.
   - Set the **Webhook URL** to `https://perqly.online/api/paystack/webhook`.
3. In Vercel → perqly → Settings → Environment Variables, add `PAYSTACK_SECRET_KEY` (Production, marked **Sensitive**) and redeploy. Don't paste the key anywhere else.
4. In Admin → Settings → Business billing (super admin, two-factor): set the monthly fee and tick **Charge businesses** when you're ready.

Test card and test mobile money numbers are on Paystack's "Test payments" page. Paystack only takes real money with live keys.

Paystack needs business details to activate live payments (business registration or a starter business account). That's on the pre-launch list.

## Safety

- The browser never sees the secret key. The server starts each payment and sends the payer to Paystack's own page.
- A payment only counts after the server asks Paystack directly whether it succeeded, the amount is at least the fee, and the currency is GHS. The webhook is checked against Paystack's signature, and is still verified with Paystack before anything is recorded.
- Confirming the same payment twice changes nothing.
