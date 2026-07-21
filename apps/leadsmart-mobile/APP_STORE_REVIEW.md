# LeadSmart mobile — store review checklist

Owner: Michael Ye. Last updated: 2026-07-12.

This doc tracks the work needed to pass Apple App Store and Google Play review
for `apps/leadsmart-mobile` (bundle `ai.leadsmart.mobile`, version 1.5.0).

## Rejection history — build 1.6 (28), 2026-07-06

Rejected on **iPad Air 11-inch (M3), iPadOS 26.5.2** for two issues.
Submission ID `3594f255-2152-4252-a775-6ec90fa84eab`.

### Guideline 4.0 — Design (Sign in button not visible) — FIXED IN CODE

Root cause: `app/(onboarding)/login.tsx` spread `s.safePad` into the
`ScrollView` `contentContainerStyle`. `safePad` carries `flex: 1`
(→ `flexShrink: 1`, clamps content to the viewport and clips overflow
instead of scrolling) and `justifyContent: "space-between"` (pins the
Sign in button to the bottom edge, under the keyboard). With the
keyboard up, the button was pinned off-screen and the ScrollView
couldn't scroll to it. iPad's taller keyboard exposed it. Fix: replaced
the spread with plain padding + `flexGrow: 1` so content flows top-down
and scrolls. **Must be re-verified in the iOS Simulator / TestFlight
with the keyboard raised before resubmitting.**

### Guideline 2.1(b) — Information Needed (business model) — REPLY REQUIRED

Apple paused the review to ask about the paid-features business model.
This is a **message reply in App Store Connect**, not a code change.
Answer: CloseBoss is a B2B CRM for licensed real estate agents;
subscriptions are purchased **only on the web** (closebossai.com); there
is no in-app purchase and nothing is sold or unlocked inside the app —
it is a client for a multiplatform service (Guideline 3.1.3(b)). Full
copy-paste reply is drafted below under "Guideline 2.1(b) reply".

> Anti-steering check (Guideline 3.1.1): 3.1.3(b) only applies if the app
> does NOT push users to buy outside it. Confirm no in-app screen shows a
> "sign up on our website" / pricing / purchase CTA before resubmitting.

### Guideline 2.1(b) reply — paste into the App Store Connect thread

> Hello, and thank you for the questions. Here is a description of our
> business model.
>
> CloseBoss is a business productivity (CRM) app for **licensed real
> estate agents**. It is a companion to our web service at
> https://www.closebossai.com. It is a business tool, not a consumer
> content/media app — there is no music, video, books, games, or other
> digital media.
>
> **1. Who are the users that will use the paid features in the app?**
> Licensed real estate agents who are existing, paying subscribers to our
> CloseBoss web service. They sign in to the mobile app with the same
> account they use on the web.
>
> **2. Where can users purchase the features that can be accessed in the
> app?** Subscriptions are purchased **only on our website**
> (https://www.closebossai.com). There is no purchasing of any kind
> inside the app, and the app does not offer, advertise, or link to any
> purchase flow. Users arrive at the app already subscribed.
>
> **3. What specific types of previously purchased features can a user
> access?** Business CRM tools tied to the agent's own account: viewing
> and managing their leads/contacts, a sales pipeline, sending SMS/email
> follow-ups to their own clients, scheduling property showings, and
> reminders/tasks. These are professional workflow tools, not digital
> content.
>
> **4. What paid content, subscriptions, or features are unlocked within
> the app that do not use in-app purchase?** None are unlocked *within*
> the app. The app is a client for a service the agent already pays for
> on the web (a multiplatform service, per Guideline 3.1.3(b)). No
> digital goods are sold or unlocked through the app.
>
> **5. Is the app for individual consumers, or for
> businesses/organizations?** It is a **business-to-business** tool sold
> to real estate professionals for use in their work.
>
> **6. Does the app require any purchase or subscription to use?** A user
> must have a CloseBoss account, created on our website. A free demo
> account is provided in App Review Information for testing:
> demo@leadsmart.ai / Demo123!
>
> We have also addressed the Guideline 4.0 sign-in layout issue in this
> same build and will resubmit. Please let us know if any further detail
> would help.

> History: build 1.6 (28) was reviewed on iPad even though
> `supportsTablet: false` — Apple runs iPhone-only apps in scaled
> compatibility mode on iPad and still enforces Guideline 4.0 there.

## Guideline 2.1(b) follow-up — build 1.6 (32), 2026-07-10

Apple replied to the round-1 answer with a narrower categorization
question (Submission ID `2a59fbd7-96cf-4d3b-b7c3-b8df0a629aec`, reviewed
iPad Air 11-inch (M3)):

> Are the enterprise services in your app sold to single users,
> consumers, or for family use?

This is Apple slotting the app into a business-model bucket to decide
whether IAP is required — **not** a new code violation. Verified before
replying: the iOS build has **no purchase steering**. Both paid-feature
surfaces gate on `Platform.OS === "ios"` and show a neutral
"not on your plan" message with no pricing CTA and no billing link:
`components/AiActionGateBanner.tsx` and the `UpgradeCard` in
`app/coaching.tsx` (the `/agent/pricing` and `/dashboard/billing` links
fire on Android only). Every other in-app `Linking.openURL` is
service-access (web dashboard), legal (privacy/terms), or content
(tel/sms/booking/published-post URLs) — none are a purchase flow.

**Account of record for Apple is `michael.yes@mail.com` (agent 30,
"Testers", Pro)** — the login used in the prior review, NOT the seeded
`demo@leadsmart.ai`. Verified green 2026-07-12: ✓ sign-in,
`/api/mobile/leads` → 13 leads (first: Jane Chen), `/api/mobile/inbox`
→ 3 threads (top: Jane Chen — "Don't forget — Open House this
Saturday, July 4th!"). The seeded `demo@leadsmart.ai` (agent 31)
remains an alternate sandbox — see "Reviewer demo account" below.

> ⚠️ michael.yes@mail.com is a real personal test account. If a reviewer
> confirms the in-app **Delete account** flow on it, the account is
> destroyed. The reviewer Notes below say NOT to confirm deletion.

### Round-2 reply — paste into the App Store Connect thread

> Hello, and thank you for the follow-up.
>
> To answer directly: the services in CloseBoss are sold to **single
> users for their business use** — individual **licensed real estate
> agents** (independent professionals / sole proprietors) who buy a
> single-seat professional subscription for their real estate business.
> We also sell to real estate **brokerages** that provide access to their
> agents. It is **not** sold to consumers for personal use, and it is
> **not** intended for family use.
>
> CloseBoss is a business-to-business productivity tool — a CRM for
> licensed real estate agents. It is not a consumer content or media app:
> there is no music, video, books, games, or other digital media.
>
> On purchasing: there is **no in-app purchase and no purchasing of any
> kind inside the app**. Subscriptions are bought only on our website
> (https://www.closebossai.com). The app does not offer, advertise, link
> to, or steer users toward any purchase flow. A user signs in with an
> account they already pay for on the web — the app is a client for a
> multiplatform business service (Guideline 3.1.3(b)).
>
> The demo account provided in App Review Information
> (michael.yes@mail.com) — the same login used in the prior review — can
> be used for testing.
>
> Please let us know if any further detail would help.

### Reviewer Notes for `michael.yes@mail.com` — paste into App Store Connect → App Information → App Review → App Review Information

**Sign-In required: Yes**
**Username**: `michael.yes@mail.com`
**Password**: `Apptesting123`

**Notes**:

> CloseBoss is a CRM for licensed real estate agents. Email/password
> sign-in only — no OTP, no SMS verification.
>
> Suggested walk-through (bottom-tab labels: Home / Work / Engage /
> Analyze / Manage):
> 1. Tap **Sign in with email** on the welcome screen.
> 2. Enter `michael.yes@mail.com` / `Apptesting123` and tap **Continue**.
> 3. **Work** tab → **Leads** tile — 13 leads load. Tap the top lead
>    (Jane Chen) for detail, pipeline stage, and AI-reply controls.
> 4. **Engage** tab → **Inbox** tile — SMS conversations load, most
>    recent first. The top thread is from Jane Chen ("Don't forget —
>    Open House this Saturday…"). Tap it to see the message history.
> 5. **Manage** tab → **Settings** tile — **Privacy policy** and **Terms
>    of service** open in the browser. **Delete account** routes to a
>    typed-confirmation screen; do NOT confirm (it permanently deletes
>    this account).
>
> The app does not handle in-app purchases, child users, or sensitive
> medical / financial data. SMS and email are sent on behalf of the
> signed-in agent to their own contacts — no cold or unsolicited
> outreach.

## Status

| Area | State | Notes |
|---|---|---|
| Account deletion (in-app) | ✅ | Settings → Delete account → confirmation. `DELETE /api/mobile/account`. |
| Account deletion (web) | ✅ | https://www.closebossai.com/delete-account — public, no install required. |
| Privacy policy link in-app | ✅ | Settings → Legal → Privacy policy. |
| Terms of service link in-app | ✅ | Settings → Legal → Terms of service. |
| `supportsTablet` | ✅ | Set to `false` — iPhone-only for v1; revisit before iPad rollout. |
| Push permission rationale | ✅ | `app/(onboarding)/notifications.tsx` shows rationale screen before prompt. |
| Sign in with Apple | ✅ | Required because Google OAuth is offered. Implemented in `lib/oauthMobile.ts`. |
| Camera / Photo permission strings | ✅ | `app.json` infoPlist + expo-image-picker plugin. |
| Export compliance | ✅ | `ITSAppUsesNonExemptEncryption: false`. |
| EAS submit config | ⚠️ | Placeholders in `eas.json`. Fill before first submit. |
| App Privacy / Data Safety form | ⏳ | Manual — App Store Connect + Play Console. |
| Screenshots + metadata | ⏳ | Manual — App Store Connect + Play Console. |

## Filling the EAS submit config

Edit `eas.json` `submit.production`:

- **iOS**
  - `appleId`: Apple ID email of the account that owns the app record in
    App Store Connect.
  - `ascAppId`: numeric "Apple ID" from App Store Connect → App Information.
  - `appleTeamId`: 10-character Team ID from
    https://developer.apple.com/account#MembershipDetailsCard.
- **Android**
  - `serviceAccountKeyPath`: path to the Google Play service account JSON.
    Download from Play Console → Setup → API access → Service accounts → keys.
    Drop the file at `apps/leadsmart-mobile/eas-play-service-account.json`
    and add it to `.gitignore` (it is a credential).
  - `track`: starts at `internal`. Change to `production` for the live rollout.

Alternatively, store credentials in EAS Dashboard rather than `eas.json` — leave
the file as placeholders and run `eas credentials` once to upload.

## Reviewer demo account

Provisioned in prod Supabase (`babmbowmzwizoahkmshx`) by
[`scripts/seed-app-review-demo-account.mjs`](../leadsmartai/scripts/seed-app-review-demo-account.mjs)
and verified end-to-end by
[`scripts/verify-app-review-demo-signin.mjs`](../leadsmartai/scripts/verify-app-review-demo-signin.mjs).

- **Email**: `demo@leadsmart.ai`
- **Password**: `Demo123!`
- **2FA / OTP**: none — email/password sign-in.
- **`auth.users.id`**: `03762a82-d1d1-4ddd-bab7-0519f4a11d6c`
- **`agents.id`**: `31` — `plan_type: pro`, brand "LeadSmart Demo", 3 demo
  contacts (Sarah Chen — rated `hot`, Marcus Reyes, Priya Iyer) with 6
  SMS messages across them so the Inbox tab is populated.

> History: Apple rejected build 1.0.0 (1) on **2026-04-02** under
> **Guideline 2.1** because the reviewer could not sign in — the demo
> account had not yet been created. Provisioned on 2026-05-27. Re-test
> with `node ./scripts/verify-app-review-demo-signin.mjs` before each
> submission.

### Paste into App Store Connect → App Information → App Review → App Review Information

**Sign-In required: Yes**

**Username**: `demo@leadsmart.ai`
**Password**: `Demo123!`

**Notes** (replace any prior "Access Token" content):

> LeadSmart is a CRM for licensed real-estate agents. The demo account
> above is a seeded test agent with three sample leads. Email/password
> sign-in only — no OTP, no SMS verification.
>
> Suggested walk-through (bottom-tab labels in v1.6+: Home / Work /
> Engage / Analyze / Manage):
> 1. Tap **Sign in with email** on the welcome screen.
> 2. Enter `demo@leadsmart.ai` / `Demo123!` and tap **Continue**.
> 3. **Engage** tab → tap **Inbox** tile — three SMS conversations
>    load, sorted most-recent first. The top thread is from Sarah Chen
>    ("Saturday afternoon works. Around 2pm?") — tap it to see the
>    full message history.
> 4. **Work** tab → tap **Leads** tile — three demo leads. Sarah Chen
>    is flagged as a hot lead. Tap any lead to view detail, pipeline
>    stage, and AI-reply controls.
> 5. **Manage** tab → tap **Settings** tile — verify **Privacy policy**
>    and **Terms of service** open in the browser. **Delete account**
>    routes to a typed-confirmation screen; do NOT confirm (it
>    permanently deletes the demo account).
>
> The app does not handle in-app purchases, child users, or sensitive
> medical / financial data. SMS and email features are sent on behalf of
> the signed-in agent to their own contacts — there is no cold messaging
> or unsolicited outreach.

## Account-deletion verification

Apple/Google reviewers test the deletion flow. To exercise it without
destroying the canonical demo account (`demo@leadsmart.ai` / `Demo123!`):

1. Sign up a throwaway agent via web (`www.closebossai.com/signup`) with a
   `+review` Gmail alias.
2. Sign into the mobile app with that throwaway.
3. Settings → Delete account → type `DELETE` → tap red button.
4. Confirm the user is returned to the login screen and that
   `select id, deleted_at, auth_user_id from agents where id = '<throwaway>'`
   returns `deleted_at` set and `auth_user_id` null.
5. Confirm `auth.users` no longer contains that row.

If the reviewer accidentally deletes the demo account, re-provision in
two steps (both idempotent):

```bash
node ./apps/leadsmartai/scripts/seed-app-review-demo-account.mjs   # user + agent + 3 contacts
node ./apps/leadsmartai/scripts/seed-app-review-demo-messages.mjs  # 6 SMS messages so Inbox isn't empty
```

Then run the gate before resubmitting:

```bash
node ./apps/leadsmartai/scripts/verify-app-review-demo-signin.mjs
# Must print all three ✓:
#   ✓ Sign-in OK
#   ✓ first lead: Sarah Chen
#   ✓ top thread: Sarah Chen — "Saturday afternoon works…"
```

## App Store listing copy (US English)

Paste each block into the matching App Store Connect field. All values
sized to fit Apple's character limits with margin to spare.

### App Name (30 chars)

```
LeadSmart
```

### Subtitle (30 chars)

```
AI assistant for real estate
```

### Promotional Text (170 chars) — updateable without re-review

```
Hot lead replied? You'll know in seconds. LeadSmart drafts your SMS and email follow-ups, tracks every prospect, and helps you close more deals — all from your iPhone.
```

### Description (4000 chars)

```
Stop losing leads to slow follow-up.

LeadSmart is the mobile CRM built for licensed real estate agents who need to reply to every prospect — fast — without sitting at a desk. AI drafts your SMS and email follow-ups in your voice, so you spend less time typing and more time closing.

⚡ REPLY FASTER
• Push notifications the moment a lead texts you back
• AI-drafted SMS and email replies you can send with one tap
• Inbox view of every active conversation, sorted by urgency
• Missed-call follow-ups handled automatically

📋 NEVER DROP A LEAD
• Pipeline view of every prospect from new to closed
• Drag-and-drop pipeline stages so you always know what's next
• Smart task reminders for the follow-ups you said you'd do
• Daily agenda surfaces what matters today, not what's overdue

📅 SHOWINGS + CALENDAR
• Schedule showings and tie them to a specific lead
• Booking link to share with prospects so they self-schedule
• Post-showing feedback forms to capture buyer intent
• Reminders for tomorrow's appointments delivered at the right time

📷 QUICK POST
• Snap a listing photo and post it to your social channels in seconds
• Schedule posts to LinkedIn and Meta from your phone
• Templates for new-listing, just-sold, open-house, and price-drop posts
• Track which posts drive the most engagement and inbound leads

🤝 SPHERE OF INFLUENCE
• Stay in front of past clients and referral sources
• Buyers and sellers organized by life-stage signals
• Smart prompts when it's time to reach out
• Built-in postcards and digital touches that feel personal

🔒 BUILT FOR PROFESSIONAL USE
• Sign in with Apple, Google, or email — your choice
• Your data stays yours: delete your account and all data anytime from Settings
• No ads, ever. We work for you, not for advertisers.
• Compliant outbound SMS designed for TCPA-aware workflows

LeadSmart is built and supported by a small team in the United States. We listen to working agents and ship updates every few weeks based on what you tell us.

Active subscription required for the AI features. Sign up at www.closebossai.com to start a free trial.

Privacy policy: https://www.closebossai.com/privacy
Terms of service: https://www.closebossai.com/terms
Account deletion: https://www.closebossai.com/delete-account
Support: contact@closebossai.com
```

### Keywords (100 chars, comma-separated, NO spaces around commas)

```
follow up,pipeline,sphere,showings,listing,broker,sales,closing,referrals,SMS,prospecting
```

We deliberately skip "real estate", "agent", "CRM", "AI" — already
indexed from App Name + Subtitle, so duplicating them wastes the
100-char budget. We also skip "Realtor" — trademark of the National
Association of Realtors, risky to claim in App Store metadata.

### What's New (4000 chars) — v1 release notes

```
Welcome to LeadSmart for iPhone.

Reply to every lead in seconds with AI-drafted SMS and email, track every deal through your pipeline, and get push alerts the moment a hot lead comes in. Built by working real estate professionals for working real estate professionals — no fluff, no ads, no upsells.
```

### Category

- **Primary**: Business
- **Secondary** (optional): Productivity

### Support URLs

- **Support URL**: `https://www.closebossai.com/contact`
- **Marketing URL**: `https://www.closebossai.com`
- **Privacy Policy URL**: `https://www.closebossai.com/privacy`

## Open items before first submit

- [ ] Fill `eas.json` submit IDs (see above).
- [ ] Seed and document the reviewer demo account.
- [ ] Fill App Privacy nutrition labels in App Store Connect.
- [ ] Fill Data Safety form in Play Console.
- [ ] Generate 3+ screenshots per device class (iPhone 6.9", iPhone 6.5",
      Android phone). Skip iPad — `supportsTablet: false`.
- [ ] Confirm app icon master is 1024×1024, opaque PNG, no rounded corners.
- [ ] Build production binary: `eas build -p all --profile production`.
- [ ] Submit: `eas submit -p ios --profile production` and
      `eas submit -p android --profile production`.

## Post-launch follow-ups

- Hard-purge sweeper job: a scheduled function that hard-deletes agent rows
  (and downstream lead / conversation / showing data) once `deleted_at` is
  older than the grace window. Currently we mark + detach; data lingers
  until the sweeper ships. Track in a separate task.
- Add `/account/delete` redirect from the marketing footer for
  discoverability. Currently only linked from the Privacy Policy.
