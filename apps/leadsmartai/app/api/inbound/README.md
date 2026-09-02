# Inbound email — Resend is the live path, SendGrid is not

**Status:** Resend chosen 2026-09-01. A Gmail/Workspace integration is expected
to replace this eventually; until then Resend carries it.

## Two routes exist; only ONE is real

| Route | Auth | Status |
|---|---|---|
| `POST /api/inbound/forwarded-email` | Svix HMAC signature over the body | **LIVE PATH** |
| `POST /api/inbound/sendgrid?k=<INBOUND_PARSE_SECRET>` | shared secret in the URL | **dead end — do not build on** |

SendGrid was the historical choice, made when Resend's free tier allowed one
domain and that slot was taken by the `helmsmart.ai` sender. Both halves of that
reasoning have since expired:

- The sender consolidated onto `closebossai.com`, freeing the constraint.
- **The SendGrid account's trial has ended** — "End of Access", 0 emails/month.
  An expired free trial is not something to route production mail through.

Resend is also the better mechanism, which is why the DNS should follow it
rather than the other way round. This route ingests forwarded email and turns it
into transaction records, extracted offer/listing fields and agent tasks. A
signed body authenticates the *sender of the request*; a secret in a query
string authenticates whoever has read an access log, a proxy trace or a
referrer header.

## Remaining step: the MX record

`inbox.closebossai.com` still points at SendGrid and must move to Resend:

```
inbox.closebossai.com.  MX  10  mx.sendgrid.net                    <- current, dead
inbox.closebossai.com.  MX  10  inbound-smtp.us-east-1.amazonaws.com  <- target
```

That target is what Resend configured on the retired `inbox.leadsmart-ai.com`,
so it is Resend's inbound host for this account rather than a guess.

**Keep it on the `inbox.` subdomain.** Resend's "Enable Receiving" has
previously tried to add an APEX MX at priority 9, which outranks Private Email
at 10 and would hijack `contact@closebossai.com` — the only mailbox on the
domain that receives. That already happened once on `helmsmart.ai`.

## Already done

- Resend inbound webhook created and Enabled, pointing at
  `https://www.closebossai.com/api/inbound/forwarded-email`.
- `RESEND_INBOUND_WEBHOOK_SECRET` set in the **`realtyboss`** Vercel project
  (Production). That is the project serving `www.closebossai.com`; the name is a
  pre-rename leftover and has caused confusion before.
- Verified live: an unsigned POST returns `401 invalid signature`, which proves
  the secret is loaded and Svix verification is running. `500 not configured`
  would mean the secret is missing.
- `INBOUND_EMAIL_DOMAIN` is unset in production and the code default is already
  `inbox.closebossai.com` ([lib/inbound/aliases.ts](../../../lib/inbound/aliases.ts)),
  so no env var is needed and the 3 existing aliases are on the right domain.

## Why the SendGrid route is still hardened

Its secret comparison was `!==`, which returns on the first differing byte and
leaks timing to an endpoint anyone can POST to. That is fixed
([lib/inbound/secret.ts](../../../lib/inbound/secret.ts)) even though the route
is now a dead end, because the route still exists and still answers. Dead code
that authenticates badly is worse than dead code that does not.

Delete the route outright once Gmail lands and this whole directory is revisited.

History: 3 aliases provisioned, exactly ONE inbound email ever received
(2026-06-26, during the original build), nothing since.
