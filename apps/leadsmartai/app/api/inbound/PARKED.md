# ⏸ PARKED — `app/api/inbound/*` (agent email-forwarding → transaction import)

**Status:** Parked 2026-09-01. Code retained on purpose; **not live, not wired, not receiving.**

## Why

Built 2026-06 (#716–#717) and then never adopted. The numbers as of parking:

| | |
|---|---|
| Aliases provisioned | 3 |
| Inbound emails ever received | **1** |
| Date of that one | 2026-06-26 — during the build itself |
| Since | nothing, in over two months |

One email in three months is not a feature in use, and keeping an enabled webhook
that fails on every delivery is noise on the Resend account for no return.

## What was actually broken, so nobody re-diagnoses it

Three separate things, and fixing any one alone would not have worked:

1. **`INBOUND_EMAIL_DOMAIN` is `inbox.leadsmart-ai.com`** — the retired domain. Its
   MX still resolves to `inbound-smtp.us-east-1.amazonaws.com`, so mail is
   accepted, but every alias handed to an agent is on a domain dead everywhere
   else. The webhook URL and the mail domain are independent: repointing the
   webhook to `closebossai.com` does not move the addresses.
2. **`RESEND_INBOUND_WEBHOOK_SECRET` is absent in production.** It has been in
   local `.env.local` for months, yet prod answers
   `POST /api/inbound/forwarded-email` → `500 {"ok":false,"error":"not configured"}`.
   The same is true of `RESEND_WEBHOOK_SECRET` on the delivery-tracking webhook —
   two different secrets, both present locally, both missing in prod. Suspect the
   Vercel **project name**: this app deploys to the project still called
   `realtyboss`, not `closeboss` or `leadsmartai`.
3. **The 3 existing aliases carry the old domain** and would need reissuing.

## Allowed / not allowed

**Allowed:** keeping the routes compiling; security fixes.
**Not allowed:** building on this path, or re-enabling the Resend webhook, without
first doing all three of the above together.

## To unpark

1. Put `RESEND_INBOUND_WEBHOOK_SECRET` in the **`realtyboss`** Vercel project
   (Production scope) and redeploy. Verify with an unsigned POST: `401
   "invalid signature"` means loaded, `500 "not configured"` means still missing.
2. Move `INBOUND_EMAIL_DOMAIN` to a `closebossai.com` subdomain and add its MX.
3. Reissue the aliases in `agent_inbound_aliases`.
4. Re-enable the endpoint in Resend.

Note the earlier decision recorded in the sending-domain notes: **SendGrid was
chosen over Resend for inbound** (`/api/inbound/sendgrid`, `INBOUND_PARSE_SECRET`,
which is also unset). If unparking, settle which of the two paths is real first —
both routes exist and only one should.
