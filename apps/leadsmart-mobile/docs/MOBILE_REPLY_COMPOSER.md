# Mobile reply composer + AI assist

## 1. UI components (`apps/leadsmart-mobile`)

| Component | File | Role |
|-----------|------|------|
| **ReplyComposer** | `components/lead/ReplyComposer.tsx` | SMS `TextInput`, **AI draft** button, Send; loading / error / short success state |
| **AiReplyButton** | `components/lead/AiReplyButton.tsx` | Small outline button + spinner |
| **EmailReplyModal** | `components/lead/EmailReplyModal.tsx` | Bottom sheet `Modal`: subject + body, **AI draft**, Send / Cancel |
| **LeadReplySection** | `components/lead/LeadReplySection.tsx` | Wires composers to mobile API + appends sent rows into thread state |

**Lead detail** (`app/lead/[id].tsx`): `KeyboardAvoidingView` wraps `ScrollView` + `LeadReplySection` (hidden for demo lead id).

## 2. Backend API (`apps/leadsmartai`)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/mobile/leads/:id/sms/send` | `{ "body": "..." }` | `{ ok, success, message }` — `message` matches `MobileSmsMessageDto` |
| POST | `/api/mobile/leads/:id/email/send` | `{ "subject", "body" }` | `{ ok, success, message }` — `MobileEmailMessageDto` |
| POST | `/api/mobile/leads/:id/sms/ai-reply` | `{}` | `{ ok, success, suggestion }` |
| POST | `/api/mobile/leads/:id/email/ai-reply` | `{}` | `{ ok, success, subject, body }` |

All routes use `requireMobileAgent` (Bearer JWT, same as other `/api/mobile/*` routes).

## 3. Service layer

- **`lib/mobile/replyComposerService.ts`**
  - Loads lead with `agent_id` + `merged_into_lead_id is null`.
  - **SMS send:** `sendOutboundSms` (Twilio + `sms_messages` insert) → loads latest outbound row.
  - **Email send:** `sendOutboundEmail` (Resend when configured + `email_messages` via `logEmailMessage`) → loads latest outbound row.
  - **SMS AI:** `fetchRecentSmsForLead` → `generateReply` with a short-SMS task (reuses `lib/aiReplyGenerator.ts`).
  - **Email AI:** `fetchRecentEmailForLead` → `generateEmailReplyDraft` (JSON subject/body from OpenAI when configured; fallback otherwise).

- **`lib/aiReplyGenerator.ts`**
  - New **`generateEmailReplyDraft`**: structured JSON draft + fallbacks (no auto-send).

## 4. Shared + client

- **Types:** `MobileSmsSendResponseDto`, `MobileEmailSendResponseDto`, `MobileSmsAiReplyResponseDto`, `MobileEmailAiReplyResponseDto` in `@leadsmart/shared` (`types/mobile-api.ts`).
- **Paths:** `MOBILE_API_PATHS` in `lib/mobileEndpoints.ts`.
- **Client:** `postMobileSmsSend`, `postMobileEmailSend`, `postMobileSmsAiReply`, `postMobileEmailAiReply` in `lib/closeBossMobileApi.ts` using `@leadsmart/api-client` `apiFetchJson`.

## 5. Integration notes

- **AI is assist-only:** drafts fill the composer; the agent edits and taps Send.
- **SMS** targets **short** replies via prompt caps; **email** returns **subject + body**.
- **Thread updates:** successful sends append by `message.id` (deduped); existing **lead detail realtime** still refetches on DB activity.
- **Env:** Twilio + `sms_messages` for SMS; Resend optional for live email delivery (rows still logged like other outbound email flows).
- **Demo lead** (`__leadsmart_demo__`): composer hidden — no API calls for sample data.
