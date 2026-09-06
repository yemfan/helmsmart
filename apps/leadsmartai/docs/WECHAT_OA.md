# WeChat Official Account (OA) — setup + operations

This app has dormant groundwork for a WeChat Service Account (服务号)
integration. The webhook route, schema, and signature / XML helpers
all ship behind a feature flag. Nothing runs in production until the
steps below are completed.

## Why this design

Mainland-Chinese clients strongly prefer WeChat over SMS for ongoing
agent contact. A Service Account lets agents send template messages
proactively and free-form replies within a 48-hour window from each
user interaction.

**Single JV-owned OA** is the realistic architecture. Tencent requires
a Chinese business entity (营业执照) to register a Service Account;
asking every US-based agent to establish one would kill the channel.
The JV owns the OA and each agent's book lives inside it, routed by
the `scene` parameter encoded into per-agent QR codes.

## Step 1 — JV business-side work (blocking, ~4-8 weeks)

Owner: @yemfan + China contact.

1. Register a **Service Account (服务号)** — not a Subscription Account
   (订阅号, which is content-push-oriented) and not a Mini Program
   (小程序, which is a separate apps-in-WeChat surface we can add later).
2. Complete Tencent's corporate verification (≈600 RMB/year).
3. Obtain:
   - **AppID** (`wx…`)
   - **AppSecret**
   - **Token** (you choose this — used for webhook signature)
   - **EncodingAESKey** (only if you enable "safe mode" encryption)
4. In the OA admin console, set the server URL to:

       https://www.leadsmart-ai.com/api/wechat/callback

   and the Token to the value you chose in step 3.

## Step 2 — Dev-side activation (once JV-side is done)

1. **Seed the `wechat_oa_accounts` row** with the real credentials:

   ```sql
   insert into public.wechat_oa_accounts (app_id, display_name, verification_token)
   values ('wx__YOUR_APP_ID__', 'LeadSmart Official Account', '__YOUR_TOKEN__');
   ```

   The `verification_token` must match what you entered in the Tencent
   admin console.

2. **Set Vercel env vars** on the `propertytoolsai-leadsmart-ai`
   project:

   | Var | Value |
   | --- | --- |
   | `WECHAT_ENABLED` | `1` |
   | `WECHAT_APP_ID` | the `wx…` AppID |
   | `WECHAT_APP_SECRET` | Tencent-issued secret (server-only; never expose) |
   | `WECHAT_ENCODING_AES_KEY` | optional; only if safe-mode enabled |

   Redeploy once — env changes don't apply retroactively.

3. **Trigger the Tencent verification handshake** by saving the webhook
   settings in the OA admin console. Tencent will GET
   `/api/wechat/callback?signature=…&timestamp=…&nonce=…&echostr=…`
   and expect our route to echo back `echostr` if the signature
   verifies. You should see the URL turn green in the admin UI.

## Step 3 — Template message submission

Tencent requires every proactive template message to be pre-approved.
Review takes ~2 weeks per template.

Submit the following in the Tencent admin console under "模板消息":

| Purpose | Rough template text |
| --- | --- |
| New lead reply | `您好，{{agent}}已收到您的消息，稍后会为您回复。` |
| Tour confirmation | `您的看房预约：{{date}} {{time}} @ {{address}}` |
| Offer update | `{{agent}}关于您的 offer 有最新进展。` |
| Document ready | `您的 {{document_name}} 已准备好，请查收。` |

Match each template id back to the Chinese drip templates seeded in
`supabase/migrations/20260483100000_seed_zh_variants.sql` where the
intent overlaps. Store approved template_ids in a follow-up migration
that extends `wechat_messages.template_id`.

## Step 4 — Per-agent QR codes

Each agent needs a unique QR code that, when scanned, encodes their
`agent_id` into the `scene` parameter. Tencent's "Permanent QR Code
with parameters" API is what we want.

API call (POST to Tencent):

```
https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=ACCESS_TOKEN

{
  "action_name": "QR_LIMIT_STR_SCENE",
  "action_info": {"scene": {"scene_str": "agent_123"}}
}
```

The webhook parses `scene_qr_value` back out on subscribe and
populates `wechat_user_links.agent_id + scene_qr_value`.

Out of scope for this PR — build when post-verification traffic starts.

## Inbox UX (future)

Once WeChat traffic is flowing, a `WeChatConversationPanel` reading from
`wechat_messages` can sit alongside the SMS and email conversation views. A
unified-timeline view across all three channels is a natural follow-up.

(The `SmsConversationPanel` / `EmailConversationPanel` components this section
originally named were removed — nothing imported them. The live SMS and email
threads render from the inbox.)

## Safety gates

The route is safely dormant in every environment where the above
steps haven't been completed:

- `WECHAT_ENABLED != "1"` → webhook returns 503
- No `wechat_oa_accounts` row matching `WECHAT_APP_ID` → webhook returns 503
- Wrong Tencent signature → 401
- Malformed XML body → empty 200 (avoids Tencent retry storm on
  corrupted input that we can't fix)

## Files in play

| File | Role |
| --- | --- |
| `app/api/wechat/callback/route.ts` | Webhook GET + POST handlers |
| `lib/wechat/verifySignature.ts` | SHA1 signature verify (+ tests) |
| `lib/wechat/xml.ts` | Tencent-specific XML parse + build (+ tests) |
| `supabase/migrations/20260484000000_wechat_oa_groundwork.sql` | Schema for oa_accounts, user_links, messages |
| `docs/WECHAT_OA.md` | this document |

## Open follow-ups (explicit TODOs)

- Outbound template-message sender (`lib/wechat/sendTemplateMessage.ts`)
  using Tencent's cgi-bin API.
- Access-token cache helper (`lib/wechat/accessToken.ts`) — tokens
  expire every 2h and Tencent rate-limits token requests.
- QR generation API for agent onboarding.
- Inbox unification view.
- Mini Program (小程序) — property-card display inside WeChat chats.
  Depth differentiator vs FUB/kvCORE. Separate project.
