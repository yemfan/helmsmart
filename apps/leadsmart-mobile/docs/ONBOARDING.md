# CloseBoss mobile — onboarding

## 1. Screens (Expo Router)

| Route | File | Role |
|--------|------|------|
| `/` | `app/index.tsx` | Session gate (loading → redirect) |
| `/(onboarding)/welcome` | `app/(onboarding)/welcome.tsx` | Welcome + CTA |
| `/(onboarding)/value` | `app/(onboarding)/value.tsx` | Two horizontal swipe value slides + dots |
| `/(onboarding)/login` | `app/(onboarding)/login.tsx` | Email/password (Supabase `signInWithPassword`); optional **Advanced** paste-JWT; validates via `GET /api/mobile/leads` |
| `/(onboarding)/notifications` | `app/(onboarding)/notifications.tsx` | Request notification permission or skip |
| `/(tabs)/inbox` | `app/(tabs)/inbox.tsx` | Post-onboarding home |

Stack layout: `app/(onboarding)/_layout.tsx` (header hidden). Root stack registers `(onboarding)` in `app/_layout.tsx`.

## 2. Routing logic

- **`CloseBossSessionProvider`** (`lib/session/CloseBossSessionContext.tsx`) hydrates:
  - Supabase session from **AsyncStorage** via `getSupabaseAuthClient()` (`lib/supabaseAuthClient.ts`) — access token refresh on `TOKEN_REFRESHED`
  - Legacy JWT from **SecureStore** if no Supabase session (older paste-only installs)
  - Onboarding flag from **AsyncStorage** (`leadsmart_onboarding_v1_complete`)
- **`getCloseBossAccessToken()`** (`lib/env.ts`) checks **in-memory cache** first (set on hydrate / login), then env/extra fallbacks for dev.
- **`app/index.tsx`**:
  1. Wait `ready`
  2. If `!onboardingComplete` → `Redirect` to `/(onboarding)/welcome`
  3. If no `accessToken` → `/(onboarding)/login`
  4. Else → `/(tabs)/inbox`
- **Login**: after successful `signInWithEmailPassword` or `signInWithToken`, if `onboardingComplete` → **Inbox**; else → **Notifications** (first run).
- **Notifications**: `markOnboardingComplete()` then `router.replace("/(tabs)/inbox")` (for both Enable and Not now).

## 3. Basic styles

Shared tokens live in `lib/onboarding/styles.ts` (`onboardingStyles`): typography, primary/secondary buttons, pager dots, inputs. App chrome continues to use `lib/theme.ts`.

## 4. Integration notes

### Push notifications

`lib/useCloseBossPush.ts` **no longer calls** `requestPermissionsAsync()` automatically. The onboarding **notifications** screen is the primary prompt; after the user grants permission, `useCloseBossPush` registers the Expo token when `getPermissionsAsync() === "granted"`.

### Demo lead

- **ID:** `__leadsmart_demo__` (`lib/demoLead.ts`)
- **Inbox:** If API returns no threads **and** `fetchMobileLeads` reports `total === 0`, one sample thread is injected.
- **Leads:** If the first page is empty and `total === 0`, one sample row is injected.
- **Lead detail:** `app/lead/[id].tsx` short-circuits for the demo id (no API, no realtime).

### Dependencies

Install from monorepo root (workspace protocol):

- `@react-native-async-storage/async-storage`
- `expo-secure-store`

### Reset onboarding (dev)

Clear app data, or remove AsyncStorage key `leadsmart_onboarding_v1_complete` and SecureStore key `leadsmart_access_token`.

### Sign out (future)

Call `signOut()` from `useCloseBossSession()` (clears token); optionally reset onboarding flag for QA.
