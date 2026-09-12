# CloseBoss mobile app — push integration

## Prerequisites

1. **Monorepo install** (from repository root): `pnpm install`
2. **Native rebuild** after adding `expo-notifications` / `expo-device` (not JS-only).

## Environment

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_LEADSMART_API_URL` | CloseBoss Next origin, no trailing slash |
| `EXPO_PUBLIC_LEADSMART_ACCESS_TOKEN` | Supabase JWT (same user as CRM agent login) |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Required for `getExpoPushTokenAsync` on many device builds |

`app.config.ts` maps these into `expo.extra`.

## Client behavior

- **`lib/useCloseBossPush.ts`** (mounted from `app/_layout.tsx`):
  - Requests notification permission on a **physical device** when a JWT is present.
  - Obtains Expo push token → **`POST /api/mobile/push/register`** via `registerMobileExpoPushToken` in `lib/closeBossMobileApi.ts` (`apiFetchJson` from `@leadsmart/api-client`).
  - Tapping a notification or cold-start from a notification opens **`/lead/[id]`** using `data.leadId`.

## Payload handling

Import **`MobilePushNotificationKind`** / **`MobilePushNotificationData`** from `@leadsmart/shared`. Supported `data.kind` values:

- `hot_lead` — agent hot / high-intent alert
- `inbound_sms` — new lead text
- `inbound_email` — new lead email
- `needs_human` — AI requested human review (`channel`, `reason` in `data`)

Extend `parsePushData` in `useCloseBossPush.ts` if you add new kinds.

## TypeScript without installed native modules

`expo-push-ambient.d.ts` provides minimal module typings so `tsc` passes before packages are hoisted; real types come from `expo-notifications` after install.

## Backend reference

See `apps/leadsmartai/docs/MOBILE_PUSH.md` for server service layout, env flags, and dedupe rules.

---

## Realtime (inbox + lead detail)

The app uses **Supabase Realtime** `postgres_changes` with the same access JWT as the mobile REST API.

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Same as CloseBoss web `NEXT_PUBLIC_SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Same as `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

Apply migration `20260460000000_mobile_message_realtime_rls.sql` so `sms_messages`, `email_messages`, and `sms_conversations` are **RLS-protected** and added to **`supabase_realtime`**.

- **Inbox**: debounced silent refetch on INSERT to `sms_messages` / `email_messages` (RLS limits events to the agent’s leads).
- **Lead detail**: debounced refetch on INSERT for that `lead_id`, plus INSERT/UPDATE on `sms_conversations` (AI thread JSON).

Hooks: `lib/realtime/useInboxRealtime.ts`, `lib/realtime/useLeadDetailRealtime.ts`.
