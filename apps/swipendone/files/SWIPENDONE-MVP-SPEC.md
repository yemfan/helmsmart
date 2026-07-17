# SwipenDone — MVP Specification
**Doc:** SD-SPEC-001 · **Status:** DRAFT · **Owner:** FND · **Date:** 2026-07-16

---

## 1. Positioning

**AI instructions get them assembled. AI diagnosis keeps them from returning it.**

- Target: SMB manufacturers, importers, Amazon/Alibaba sellers shipping physical products that require assembly, installation, or setup.
- Wedge: bilingual EN/中文 output — sellers sourcing from China with poor factory manuals.
- Business model: hosted guides + QR codes (recurring lock-in), scan analytics + AI diagnosis as paid tiers.

## 2. Product surfaces

### 2.1 Buyer guide (public, no login) — prototype built
- Swipeable card deck: cover → parts checklist → steps → done screen.
- EN/中文 toggle, single URL per product, QR-linked.
- Done screen: warranty registration (email capture for seller).
- Free-tier watermark: "Made with SwipenDone."

### 2.2 AI Diagnosis (NEW — core differentiator)
- Entry point: persistent "Something's wrong?" button on every guide screen.
- Flow: buyer describes issue (text or voice) + optional photo → Claude API diagnoses against product knowledge base (steps, parts list, known issues) → returns fix with reference to the relevant step.
- Escalation: unresolved after 2 attempts → structured ticket to seller (issue, step, photo, buyer contact). This replaces the buyer's "return it" impulse with a resolution path.
- Every diagnosis logged → feeds analytics ("34% of issues occur at step 2").
- Bilingual: buyer writes in either language; seller receives tickets in their preferred language.

### 2.3 Creator dashboard (seller, authenticated)
- Upload: photos + rough notes (or messy factory manual, any format) → AI generates ordered steps, captions, tips, parts list, both languages.
- Edit: reorder steps, edit text per language, swap images.
- Publish: hosted URL + downloadable QR (print-ready PNG/SVG/PDF) + deck-style PDF export.
- Analytics v1: scan count, completion rate, diagnosis count by step.

## 3. MVP cut list (explicitly deferred)
- Payments (manual onboarding for Founding users)
- Teams, API, white-label
- Voice diagnosis (text + photo only at launch)
- Step-level drop-off dashboards (log events now, visualize later)
- Video embeds

## 4. Stack
- Next.js on Vercel · Supabase (auth, Postgres, storage) · Claude API (generation, translation, diagnosis vision)
- Same infra as LeadSmart — zero new operational surface.

## 5. Data model (v1)
- `sellers` → `products` → `guides` (versioned) → `steps`
- `scans` (guide_id, ts, lang, device)
- `step_events` (scan_id, step, action) — logged from day one
- `diagnoses` (guide_id, step_ref, input_text, photo_url, resolution, escalated)
- `registrations` (guide_id, buyer_email, consent) — seller CRM export

## 6. Pricing (working hypothesis)
| Tier | Price | Includes |
|---|---|---|
| Free | $0 | Unlimited PDF (watermark), 1 hosted guide, basic scans |
| Pro | $49/mo | Unlimited hosted, no watermark, bilingual, QR, branding |
| Business | $99–149/mo | AI diagnosis, escalation tickets, step analytics, registrations export |

Founding cohort: diagnosis included at Pro price for first 20 accounts (mirror LeadSmart Founding 20 playbook).

## 7. Phases
- **Phase 0 (FND):** Register swipendone.com + .ai. USPTO knockout in TESS, Classes 009/042 (attorney review — note LeadSmart precedent). Landing page with waitlist.
- **Phase 1 (DEV):** Buyer guide (port prototype) + creator upload/AI generation + hosted publish + QR. Scan logging.
- **Phase 2 (DEV):** AI diagnosis + escalation tickets + registration capture.
- **Phase 3 (CNT/TOM):** Analytics dashboard, PDF export polish, TOM validation pass (TVR series), Founding 20 outreach.

## 8. Gates before launch
- [ ] Domain + trademark knockout confirmed (FND)
- [ ] AI diagnosis liability language — ToS must disclaim safety-critical products (electrical, gas, child products); attorney review (FND)
- [ ] Photo upload privacy policy + retention window (FND)
- [ ] Diagnosis accuracy bar: internal eval on 20 seeded failure cases before exposing to buyers (DEV/TOM)
- [ ] One design partner committed — a real seller with a real SKU (FND)

## 9. Open questions
1. Diagnosis rate limits on free/Pro to control API cost?
2. Seller-facing language default: EN, 中文, or auto-detect?
3. Does warranty registration data belong to seller only, or shared (network effects vs. trust)?
