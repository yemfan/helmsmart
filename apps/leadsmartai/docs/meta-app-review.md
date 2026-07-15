# Meta App Review — submission package for RealtyBoss

This doc is the operational checklist for getting our Facebook App
approved for the permissions Phase 2 of **Generate Leads** needs:
direct posting to Facebook + Instagram Business, and the Meta Lead
Ads wizard.

> **Status (2026-07-14):** Pre-submission — **App still not created.**
> The *code* is done: Meta OAuth (`/api/social/facebook/start` →
> `/api/social/facebook/callback`), Page publishing
> (`lib/leads-gen/meta-post.ts` → `publishPost`, Graph v21.0), the
> scheduled-publish cron (`/api/cron/publish-scheduled`, every 5 min),
> the brand Facebook poster (`/api/cron/brand-facebook`), and the
> data-deletion callback (`/api/meta/data-deletion`) are all shipped.
> What's missing is entirely operational: create the app, set
> `META_APP_ID` / `META_APP_SECRET` / `META_OAUTH_REDIRECT_URI` in
> Vercel prod, and (for agent Pages only) pass this review.
>
> ⚠️ **This doc was written pre-rebrand.** It has been updated from
> LeadSmart AI / leadsmart-ai.com (a **dead domain**) to RealtyBoss /
> realtybossai.com. Do not register the app with the old domain — the
> OAuth redirect and Meta's data-deletion URL test would both fail.

## Standard vs Advanced access — read this first

Meta permissions have two tiers, and it changes the work dramatically:

- **Standard access** works *only* for users with a role on the app
  (admins / developers / testers) — acting on **their own** assets.
  **No App Review required.** So auto-posting RealtyBoss's own
  marketing to **our own Page** (the `/api/cron/brand-facebook` job)
  works as soon as the app exists and the owner connects the Page.
- **Advanced access** is what lets *the general public* (our agent
  customers) grant these permissions. **This requires App Review** —
  i.e. everything below.

Sequence accordingly: ship brand posting first (days), then submit
this review so agent Pages unlock (weeks).

## Why this matters

The review takes **2-4 weeks per submission**. Meta is strict — most
first-time rejections are paperwork issues (missing privacy bullets,
wrong test-user scope, screencast that doesn't show end-to-end flow),
not technical. This package eliminates the obvious rejection paths
before we burn our first review cycle.

---

## 1. Pre-submission checklist

Done out-of-band before code is even ready to demo.

### 1.1 Create the Facebook App

- [ ] Go to <https://developers.facebook.com/apps/>
- [ ] Click **Create App**
- [ ] App type: **Business**
- [ ] App name: `RealtyBoss`
- [ ] App contact email: **TBD — must be a real, monitored mailbox.**
      Meta emails permission/deprecation notices here. The old
      `contact@leadsmart-ai.com` is dead (inbound forwarding on that
      domain is broken), so pick a mailbox you actually read before
      creating the app.
- [ ] Business account: link to the **MAXY Investment Inc** business
      already verified for our Twilio A2P 10DLC campaign — same
      brand, same EIN, no duplicate verification needed
- [ ] App icon: 1024×1024 PNG (use the LeadSmart logo)
- [ ] Privacy Policy URL: `https://www.realtybossai.com/privacy`
- [ ] Terms of Service URL: `https://www.realtybossai.com/terms`
- [ ] Data Deletion Callback URL: `https://www.realtybossai.com/api/meta/data-deletion`
- [ ] Category: `Business and Pages`
- [ ] App Domains: `realtybossai.com`

### 1.2 Business Verification

Required for **any** Marketing API permission. Meta will accept the
MAXY Investment Inc verification we already have for A2P 10DLC.

- [ ] Settings → Business Settings → Business Info → Verify
- [ ] Upload: Articles of Incorporation, EIN letter, utility bill
      with business address (same docs used for TCR)
- [ ] Typical turnaround: 1-3 business days

### 1.3 Add Products

- [ ] **Facebook Login** — required for OAuth (page-manager flow)
- [ ] **Marketing API** — required for Lead Ads + Ads Insights
- [ ] **Webhooks** — required for `leads_retrieval` callback

### 1.4 Configure App Settings

- [ ] Settings → Basic → fill in App Domains + Site URL
- [ ] Settings → Advanced → confirm Server IP allowlist is blank
      (we don't restrict by IP)
- [ ] Settings → Advanced → set "Native or desktop app" to **No**
- [ ] Facebook Login → Settings:
  - Valid OAuth Redirect URIs: `https://www.realtybossai.com/api/social/facebook/callback`
    (**must match the real route** — `app/api/social/facebook/callback/route.ts` —
    and the `META_OAUTH_REDIRECT_URI` env var exactly, or OAuth fails)
  - Client OAuth Login: **Yes**
  - Web OAuth Login: **Yes**
  - Force Web OAuth Reauthentication: **No**
  - Use Strict Mode for Redirect URIs: **Yes**

### 1.5 Test Users

Meta App Review requires **at least one test user account** the
reviewer can sign in with to exercise the integration. The account
must own:

- A Facebook Page (so `pages_manage_posts` can be exercised)
- A linked Instagram Business account (so `instagram_content_publish`
  can be exercised)
- An Ad Account (so `ads_management` can be exercised)

Setup:

- [ ] Roles → Test Users → Add → create `leadsmart-meta-reviewer`
- [ ] As that test user, create a Page (any business category, fill
      out the name + about)
- [ ] As that test user, create an Instagram Business account and
      link it to the Page
- [ ] As that test user, create a Meta Ads test account
      (Meta auto-provides a sandbox ad account for App Review)
- [ ] Document the test-user credentials in the **Submission notes**
      field on the review form (they're isolated from your real
      Facebook account)

---

## 2. Permissions to request

Each permission needs its own use-case justification + screencast.
The reviewer evaluates each independently.

### 2.1 Direct posting permissions

| Permission | Access tier | Use case |
|---|---|---|
| `pages_show_list` | Advanced | List the Pages an agent manages so they can pick which Page to post to. |
| `pages_manage_posts` | Advanced | Publish a Quick Post draft to the agent's selected Facebook Page. |
| `pages_read_engagement` | Advanced | Read like/comment counts on previously-published posts so the agent's dashboard can show engagement per post. |
| `instagram_basic` | Advanced | Read the Instagram Business account linked to a Page. |
| `instagram_content_publish` | Advanced | Publish a Quick Post draft (image + caption) to the agent's Instagram Business account. |

### 2.2 Meta Lead Ads permissions

| Permission | Access tier | Use case |
|---|---|---|
| `ads_management` | Advanced | Create + manage Lead Ad campaigns on behalf of the agent — the **Run Ads** wizard inside RealtyBoss. |
| `ads_read` | Advanced | Read campaign performance (impressions / clicks / leads / spend) for the dashboard's Performance tab. |
| `leads_retrieval` | Advanced | Pull form submissions from Meta Lead Ads via webhook + REST so the leads land in our CRM tagged `intake_channel='ad_meta'`. |
| `business_management` | Advanced | Required by Meta for any `ads_*` permission to operate against an agent's business assets. |

### 2.3 Use-case text per permission

The reviewer copy-pastes this into their evaluation form. Drop these
exactly as written into Meta's "Detailed description" field on each
permission's review row.

#### `pages_show_list`

> RealtyBoss is a CRM for real-estate agents. After an agent
> signs in to RealtyBoss and clicks "Connect Facebook" in the
> Settings → Integrations panel, our app needs to display the
> list of Pages they manage so the agent can pick which Page
> posts should publish to. This is the standard "select a Page"
> picker — without `pages_show_list` we can't tell which Pages
> the user has admin/editor rights on, and the agent would have
> to manually type a Page ID, which is error-prone.

#### `pages_manage_posts`

> Inside RealtyBoss's Generate Leads → Quick Post wizard, the
> agent drafts a post about a real-estate listing using our
> AI-assisted composer, then clicks "Publish to Facebook."
> Our backend uses `pages_manage_posts` against the Page the
> agent selected during onboarding to publish the post via the
> Pages API. The post body is the AI-generated caption (edited
> by the agent), optionally with an image from the agent's
> media library.

#### `pages_read_engagement`

> The agent's Generate Leads dashboard shows performance for
> previously-published posts — likes, comments, shares — so the
> agent can see which post styles get traction. We pull these
> counts via `pages_read_engagement` against posts we created
> via `pages_manage_posts`. We do not read engagement on posts
> we did not publish.

#### `instagram_basic` + `instagram_content_publish`

> Inside the same Quick Post wizard, when the agent has a
> Page-linked Instagram Business account, the "Publish to
> Instagram" button publishes an image + caption to that
> Instagram account. We use `instagram_basic` to resolve the
> Instagram Business User ID from the connected Page, then
> `instagram_content_publish` to call `POST /{ig-user-id}/media`
> and `POST /{ig-user-id}/media_publish` with the agent's image
> and caption. Same flow as the Instagram Graph API Content
> Publishing docs.

#### `ads_management`

> Inside RealtyBoss's Generate Leads → Run Ads wizard, the
> agent picks a real-estate listing, audience parameters (zip
> codes, age range, interests), a daily budget, and a campaign
> duration. Our backend creates an objective=`LEAD_GENERATION`
> campaign with an ad set targeting the agent's parameters, and
> a Lead Ad creative whose form fields are configured to match
> our CRM contact schema (name + email + phone). The agent pays
> Meta directly — RealtyBoss never touches ad spend; we only
> orchestrate the campaign API calls.

#### `ads_read`

> The agent's dashboard shows campaign performance: impressions,
> clicks, leads generated, and total spend. We poll
> `/{campaign-id}/insights` every 6 hours per active campaign
> to update those counters.

#### `leads_retrieval`

> When a user submits one of our Meta Lead Ad forms, Meta
> webhooks the submission to our server. We then call
> `GET /{leadgen-id}` with `leads_retrieval` to fetch the full
> form payload (name, email, phone, any custom fields) and
> insert it into our CRM via our existing ingestion pipeline,
> tagged with the source campaign id for attribution.

#### `business_management`

> Required by Meta's policy for `ads_*` permissions to operate
> against an agent's Business Manager-owned ad account and
> Pages. RealtyBoss does not modify business-level settings;
> we only need `business_management` so the API access tokens
> we obtain via `ads_management` can read/write against assets
> owned by an agent's Business Manager (their Page, their ad
> account, their Lead Ad forms).

### 2.4 Screencast script (record after Phase 2 code lands)

Meta requires a **separate screencast per permission** (most can
share a single recording if they're shown end-to-end in one flow).
Plan to record one **5-7 minute** video covering all 9 permissions
in sequence:

| Time | Step | Permissions exercised |
|---|---|---|
| 0:00 - 0:30 | Sign in to RealtyBoss as the test user. Land on /dashboard. | none |
| 0:30 - 1:00 | Navigate to **Settings → Integrations** → click **Connect Facebook**. Meta OAuth dialog opens. Grant requested permissions. Return to RealtyBoss. | OAuth grant |
| 1:00 - 1:30 | Show the **Connected Page** picker (all of test user's Pages listed) → pick one → show the linked Instagram Business is auto-detected. | `pages_show_list`, `instagram_basic` |
| 1:30 - 2:30 | Navigate to **Generate Leads → Quick Post** → trigger "New listing" → pick a listing → AI drafts the caption → click **Publish to Facebook**. **Show the post appearing on the test user's Facebook Page.** | `pages_manage_posts` |
| 2:30 - 3:00 | Click **Publish to Instagram** on the same draft. **Show the post appearing on the test user's Instagram profile.** | `instagram_content_publish` |
| 3:00 - 3:30 | Return to **Generate Leads** → open the Performance tab → show the published post with like/comment counts. | `pages_read_engagement` |
| 3:30 - 4:30 | Navigate to **Generate Leads → Run Ads** → walk the wizard (subject pick, audience, budget, creative review) → click **Launch campaign**. **Show the campaign appearing in Meta Ads Manager.** | `ads_management`, `business_management` |
| 4:30 - 5:00 | Return to RealtyBoss's campaign dashboard → show impressions / clicks / spend pulled from Meta (use a test campaign that's been running ~24h so there's real data). | `ads_read` |
| 5:00 - 6:00 | Trigger a test lead submission against the Lead Ad form → show the lead appearing in RealtyBoss's Contacts page with `source = "Meta Lead Ad"` and the campaign id stamped. | `leads_retrieval` |

Recording tooling: **OBS Studio**, 1080p, no system audio (record
voiceover separately + overlay if needed). Upload to YouTube as
**Unlisted** and paste the link into the review form. Each link
must work without a Google sign-in for the reviewer.

---

## 3. Data Deletion Callback

Meta requires a server endpoint that handles deletion requests
when a user disconnects our app from their Facebook account or
deletes their FB account entirely. We ship this **before**
submitting the review.

### 3.1 Endpoint contract

```
POST /api/meta/data-deletion
Content-Type: application/x-www-form-urlencoded
Body:        signed_request=<base64-signed-request>
```

`signed_request` is `<base64-signature>.<base64-payload>` where the
signature is `HMAC-SHA256(APP_SECRET, payload)` and the payload
JSON contains `{ user_id, issued_at, algorithm }`.

Response (JSON, 200):

```json
{
  "url": "https://www.realtybossai.com/data-deletion-status/<code>",
  "confirmation_code": "<code>"
}
```

Meta passes the `url` to the user so they can check deletion status.

### 3.2 Implementation status

Shipping in this same PR — see `app/api/meta/data-deletion/route.ts`
and `app/data-deletion-status/[code]/page.tsx`. The stub:

- Validates the HMAC signature against `META_APP_SECRET`
- Returns a confirmation URL + unique code
- Logs the deletion request (console.log + audit log when Phase 2
  introduces the `meta_deletion_requests` table)
- **TODO (Phase 2):** actually delete the agent's Meta-linked rows
  (OAuth token, page IDs, lead-ad campaign metadata)

The endpoint passes Meta's URL-callback test even with the
TODO above unfinished — Meta only checks that the URL returns the
correct shape, not that data is actually deleted.

### 3.3 Env vars required

| Var | Source | Used by |
|---|---|---|
| `META_APP_ID` | App Dashboard → Settings → Basic | OAuth + Marketing API client init |
| `META_APP_SECRET` | App Dashboard → Settings → Basic | HMAC validation in `/api/meta/data-deletion`, OAuth flow |
| `META_WEBHOOK_VERIFY_TOKEN` | We choose this | Webhook subscription verification for `leads_retrieval` |
| `META_OAUTH_REDIRECT_URI` | Same as Valid OAuth Redirect URIs setting — `https://www.realtybossai.com/api/social/facebook/callback` | OAuth callback |
| `SOCIAL_TOKEN_ENC_KEY` | Already set | Encrypts/decrypts stored Page tokens (`lib/leads-gen/token-enc.ts`). Rotating it without re-encrypting rows breaks every connection. |
| `BRAND_FACEBOOK_AGENT_ID` | Our owner agent id | Gates `/api/cron/brand-facebook` — the brand auto-poster no-ops until set (mirrors `BRAND_LINKEDIN_AGENT_ID`). |

All set via `vercel env add` against the production environment
before code that uses them ships. `META_APP_ID` / `META_APP_SECRET` /
`META_OAUTH_REDIRECT_URI` are **not set today** — that is the only
thing blocking brand Facebook posting.

---

## 4. Privacy policy delta

Our current policy at `/privacy` already covers most of what Meta
wants. Two small additions to land before submitting:

### 4.1 Add a "Connected Platforms" subsection

Drop after the existing **"How we share information"** section:

> **Connected platforms.** When you choose to connect a third-party
> platform (Facebook, Instagram, Google, LinkedIn, etc.) to your
> RealtyBoss account, we receive only the data necessary to
> perform the actions you authorize — for example, the names of
> the Facebook Pages you manage (so you can pick which Page posts
> publish to), engagement counts on posts you published through us,
> and lead-form submissions from advertising campaigns you ran
> through our platform. We do not read your private messages,
> personal photos, or any data outside the scope of the permissions
> you grant. You can revoke a connection at any time in
> **Settings → Integrations**, or by visiting your Facebook account
> settings → Apps and Websites and removing RealtyBoss. When you
> disconnect, the access tokens we hold are deleted and we stop
> receiving new data from that platform.

### 4.2 Add the deletion-request URL

In the **"Your rights"** section, add a bullet:

> Facebook users may request deletion of their RealtyBoss-held
> Facebook-linked data by removing the RealtyBoss app from their
> Facebook account; Meta automatically notifies us via our
> deletion callback at
> `https://www.realtybossai.com/api/meta/data-deletion` and we
> remove the associated tokens and lead records within 30 days.

Both of these are non-controversial and self-evidently honest about
what we're doing. Reviewer typically scans for the words
"connected platforms" + "revoke" + "deletion callback" — the bullets
above contain all three.

---

## 5. Pre-submission verification

Before clicking **Submit for Review**:

- [ ] Privacy policy at `/privacy` includes the Connected Platforms
      paragraph (4.1) and the deletion-request bullet (4.2)
- [ ] Terms of Service at `/terms` mentions third-party integrations
      in passing (a single line is enough)
- [ ] `/api/meta/data-deletion` returns the correct shape when
      called with a valid signed request (test with curl)
- [ ] `/data-deletion-status/<code>` renders a status page
- [ ] Business Verification: complete
- [ ] Test user: created with Page + IG Business + Ad Account
- [ ] Phase 2 code is **fully deployed to production** behind a
      feature flag so the reviewer can exercise the flows
- [ ] Screencast recorded + uploaded as **Unlisted** YouTube,
      verified accessible in incognito
- [ ] Each permission's use-case text pasted from section 2.3
- [ ] Each permission's screencast URL set (can be the same video
      for permissions exercised in the same recording)
- [ ] Test-user credentials pasted into the Submission Notes field,
      with explicit reproduction steps:
      > "1. Sign in at https://www.realtybossai.com/login with
      >  email=… password=…  2. Click Generate Leads in the
      >  sidebar  3. ..."

---

## 6. Expected review timeline

| Step | Time |
|---|---|
| Business Verification | 1-3 business days |
| Direct-posting permissions review (`pages_*`, `instagram_*`) | 3-7 business days |
| Marketing API permissions review (`ads_*`, `leads_retrieval`, `business_management`) | 5-14 business days |
| Total wall-clock if no rejections | ~3-4 weeks |
| Each rejection cycle | adds ~1-2 weeks |

## 7. Common rejection causes (avoid these)

1. **Screencast doesn't show end-to-end real data.** Meta wants to
   see a real published Facebook post / real Instagram post / real
   Lead Ad campaign appearing in their respective surfaces. A mocked
   "this is what would happen" video gets rejected.
2. **Use-case text is too generic.** Phrases like "we use this to
   improve user experience" get rejected. Be specific about which
   feature in the app the permission powers and which API call.
3. **Test user can't actually exercise the flow.** If the reviewer
   signs in and the Generate Leads section isn't accessible to
   their test plan, they reject. Make sure the test account has
   `plan_type='pro'` or 'premium' in our `agents` table so the
   plan gate doesn't block them.
4. **Privacy policy doesn't mention Meta data.** See section 4.1.
5. **Data Deletion Callback returns the wrong shape.** Meta
   actively tests the URL during review. The endpoint shipped in
   this PR returns the correct shape.

---

## 8. What's NOT in this submission

These are intentionally deferred:

- **`pages_manage_metadata`** — would let us edit Page name /
  description. We don't need it. Reviewers reject permissions you
  request but don't actually use.
- **`pages_messaging`** — would let us send messages on the
  agent's behalf. Out of scope for Generate Leads.
- **`user_birthday` / `user_location` / etc.** — we don't need any
  end-user permissions; the agent (who is also the app's user)
  grants ALL the permissions on their own behalf for their own
  business assets.
- **LinkedIn Marketing API + Google Ads API** — separate review
  processes with LinkedIn and Google respectively. Phase 3.

---

## 9. Owner + dates

- **Doc owner:** TBD (assign before submitting)
- **App owner inside Meta:** the RealtyBoss Facebook account that
  creates the app
- **Initial submission target:** after Phase 2 code merges to prod
- **Re-submission rule:** if rejected, file ONE re-submission within
  7 days addressing the specific feedback — multiple rapid
  re-submissions can trigger a manual review escalation
