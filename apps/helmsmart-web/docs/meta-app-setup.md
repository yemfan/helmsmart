# HelmSmart Meta app — setup

Facebook + Instagram publishing is **code-complete**. `isMetaConfigured()` returns
false without credentials, so the Connect button reports `not_configured` rather
than half-working. This is the operational checklist to switch it on.

> **Status (2026-07-19): app CREATED — App ID `1740306877169005`.**
> Use cases, OAuth settings and all three redirect URIs are configured and
> verified. **Remaining: put `META_APP_ID` + `META_APP_SECRET` into Vercel
> (project `helmsmart`, Production) and redeploy.** Nothing else is outstanding.

## ⚠️ The business portfolio can't claim apps

Attaching the **LeadSmart AI** portfolio during creation fails hard:

> **Business is not allowed to claim App** — *Your business is prohibited from
> advertising, including claiming apps.*

So the app was created with **no business portfolio**, which is also why the
CloseBoss app shows `Type: None`. This is an account-level restriction on the
portfolio, not something the app setup can route around.

**Consequences:**
- **Standard Access is unaffected** — publishing to a Page you have a role on
  works today. That's the whole near-term path.
- **App Review / Advanced Access is blocked** until the restriction is lifted,
  because review requires a verified business portfolio. Customer Pages
  therefore can't be connected yet, regardless of code.

Resolving it is a Meta account matter (appeal the advertising restriction, then
complete Business Verification) — worth starting early, since it gates the
multi-tenant story for both products.

## Why a separate app (not CloseBoss's)

CloseBoss already has Meta app `2768243443543435`. HelmSmart deliberately gets
its **own**, for two reasons:

1. **The consent screen shows the app name.** Riding on CloseBoss's app means a
   HelmSmart — or DoctorSmart — customer clicks "Connect Facebook" and reads
   *"CloseBoss wants to manage your Page."* Confusing at best, and it erodes
   trust at exactly the moment you're asking for Page permissions.
2. **App Review is per-app, per-use-case.** CloseBoss's submission is scoped to
   real estate. Pushing a medical vertical's traffic through it makes that
   harder to defend, and one rejection would take down *both* products'
   publishing.

## 1. Create the app — DONE

<https://developers.facebook.com/apps> → **Create App**

| Field | Value |
|---|---|
| Name | **HelmSmart** — this is what customers see on the consent screen |
| Contact email | fan.yes@gmail.com |
| Business portfolio | **none** — see the restriction above |

Meta's current flow asks for **use cases** rather than raw products/permissions.
The two that grant what the code needs (`pages_manage_posts`,
`pages_read_engagement`, `instagram_basic`, `instagram_content_publish`):

- **Manage everything on your Page**
- **Manage messaging & content on Instagram**

Creating the app requires a password re-entry, and agreeing to the Meta Platform
Terms + Developer Policies.

## 2. Client OAuth settings — DONE (defaults were already correct)

Under **Facebook Login for Business → Settings**. Note the product is *Login for
Business*, not classic Facebook Login — but the classic scope-based OAuth flow
the code uses still applies, because:

| Setting | Value |
|---|---|
| Client OAuth login | Yes |
| Web OAuth login | Yes |
| Enforce HTTPS | Yes |
| Use Strict Mode for redirect URIs | Yes |
| Force Web OAuth reauthentication | No |

Strict Mode is why the redirect URIs below must match **exactly**.

## 3. Valid OAuth Redirect URIs — DONE

Facebook Login for Business → Settings → **Valid OAuth Redirect URIs**. All
three, exactly — `https`, no trailing slash:

```
https://www.helmsmart.ai/api/auth/meta/callback
https://helmsmart.ai/api/auth/meta/callback
https://doctor.helmsmart.ai/api/auth/meta/callback
```

**All three matter.** Verticals are host-routed, and the redirect URI follows the
host the user is actually on (`getMetaConfig(requestHost)` — see `lib/meta.ts`).
Omitting `doctor.*` breaks Connect for the medical pack, and it fails as
`bad_state`, which reads like a CSRF attack rather than a missing config line.

Add a row for every future vertical subdomain at the same time you add the domain.

## 4. Vercel env — project `helmsmart`, Production — **OUTSTANDING**

| Var | Value |
|---|---|
| `META_APP_ID` | `1740306877169005` |
| `META_APP_SECRET` | App Settings → Basic → **Show** (copy it yourself — it's a secret) |

Then **redeploy** — env changes don't apply to existing deployments.

**Leave `META_OAUTH_REDIRECT_URI` unset.** It's a single-domain escape hatch that
pins one URI and overrides the per-host resolution above; setting it re-breaks
the pack subdomains.

`META_GRAPH_VERSION` is also optional — defaults to the shared constant in
`@helm/dna-marketing`. Meta deprecates a Graph version ~2 years after release,
so recheck annually: <https://developers.facebook.com/docs/graph-api/changelog>

## 5. What works before App Review

**Standard Access** publishes to Pages owned by someone with a role on the app —
enough to prove the whole path with your own Page.

**Customer** Pages need **Advanced Access** on `pages_manage_posts`,
`pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, which
means App Review (2-4 weeks, and rejections are usually paperwork). Ship
Standard first, submit review after — same sequence that worked for CloseBoss.

## 6. Connecting

`/social` → **Connect Facebook**. On Meta's screen, **tick the Page** you want —
granting the app without selecting a Page returns `no_pages_granted`.

The success banner names the Page it connected, so a wrong pick is visible
immediately rather than when a post appears somewhere unexpected.

Instagram additionally needs an **Instagram Business account linked to that
Page**. If it isn't, the banner says so on connect, and IG posts fail with a
permanent (non-retrying) error explaining why — Instagram also has no text-only
post, so every IG post needs an image.

## After setup

Once `META_APP_ID` / `META_APP_SECRET` are live, the remaining verification is:
connect a Page, publish one real post to Facebook, and confirm `social_posts`
records `published` with a `published_url`.
