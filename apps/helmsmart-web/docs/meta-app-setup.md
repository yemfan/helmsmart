# HelmSmart Meta app — setup

Facebook + Instagram publishing is **code-complete and inert**. `isMetaConfigured()`
returns false without credentials, so the Connect button reports `not_configured`
rather than half-working. This is the operational checklist to switch it on.

> **Status:** app not yet created. Everything below is a one-time setup on
> developers.facebook.com; no code changes are needed after it.

## Why a separate app (not RealtyBoss's)

RealtyBoss already has Meta app `2768243443543435`. HelmSmart deliberately gets
its **own**, for two reasons:

1. **The consent screen shows the app name.** Riding on RealtyBoss's app means a
   HelmSmart — or DoctorSmart — customer clicks "Connect Facebook" and reads
   *"RealtyBoss wants to manage your Page."* Confusing at best, and it erodes
   trust at exactly the moment you're asking for Page permissions.
2. **App Review is per-app, per-use-case.** RealtyBoss's submission is scoped to
   real estate. Pushing a medical vertical's traffic through it makes that
   harder to defend, and one rejection would take down *both* products'
   publishing.

## 1. Create the app

<https://developers.facebook.com/apps> → **Create App**

| Field | Value |
|---|---|
| Type | **Business** |
| Name | **HelmSmart** — this is what customers see on the consent screen |
| Contact email | your admin address |
| Business account | link the existing **MAXY Investment Inc** verification (same EIN — no re-verification) |

## 2. Add products

- **Facebook Login**
- **Instagram Graph API**

## 3. Valid OAuth Redirect URIs

Facebook Login → Settings → **Valid OAuth Redirect URIs**. Add all three,
exactly — `https`, no trailing slash:

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

## 4. Vercel env — project `helmsmart`, Production

| Var | Where |
|---|---|
| `META_APP_ID` | App Settings → Basic |
| `META_APP_SECRET` | App Settings → Basic → Show |

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
Standard first, submit review after — same sequence that worked for RealtyBoss.

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
