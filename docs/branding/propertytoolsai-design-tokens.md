# PropertyTools AI — design tokens and stack

The real production values for `www.propertytoolsai.com`, so an audit anchors
to them instead of guessing. Every line below was re-verified against the
source on **2026-09-12**; each cites where to re-check it.

## Tokens

From `apps/propertytoolsai/app/globals.css`:

| token | value | line |
| --- | --- | --- |
| `--color-brand-primary` | `#0072ce` (blue) | 16 |
| `--color-brand-surface` | `#f5f5f5` | 19 |
| `--color-brand-text` | `#333333` | 20 |
| `--color-accent` | `#ff8c42` (orange) | 37 |

`--color-accent` is live — `globals.css:182` sets `color: var(--color-accent)`.

## Type and stack

Next.js on Vercel, apex redirects to `www`. Tailwind v4 utility classes,
Turbopack chunks. Fonts are **Montserrat** (headings) and **Roboto** (body),
self-hosted through `next/font/google` with woff2 preload —
`apps/propertytoolsai/app/layout.tsx:4`.

The primary CTA is a custom gradient rather than a token:
`from-[#0072ce] via-[#4F46E5] to-[#7c3aed]`, hover
`from-[#005ca8] to-[#3730a3]` —
`components/landing/PropertyToolsHomePage.tsx:98`.

## Contrast

**`#0072ce` on white is 4.89:1.** That passes WCAG AA at both small and large
text. Computed from the sRGB relative-luminance formula, not estimated.

This corrects the figure this document carried while it lived in agent memory,
which said 4.56:1 and concluded the colour "passes AA large but fails AA
small". It does not fail; anchoring a contrast fix to that number would have
changed a compliant colour for no reason. Recompute rather than quote if the
token ever moves.

## Findings that are closed

Recorded here so they are not re-reported as open. All four were true when
observed on 2026-04-09 and are fixed as of 2026-09-12:

| was | now |
| --- | --- |
| Hero stats hardcoded to `0+ Estimates`, `0 Free tools`, `0s Average result time` — three literal zeros in production | real values, e.g. `{ value: 50000, suffix: "+" }` (`PropertyToolsHomePage.tsx:531`) |
| No footer anywhere — no Privacy, Terms, Contact, About | `components/Footer.tsx`, linking `/privacy`, `/privacy#ccpa`, `/privacy#cookies`, `/terms`, `/about`, `/contact` |
| Homepage mixed `text-gray-*` and `text-slate-*` families | slate only — 40 `text-slate-*`, zero `text-gray-*` on the homepage |
| Marketing homepage wrapped in a 272px app-style left sidebar (`lg:w-[272px]`) rather than a marketing top-nav | no `272px` remains in any `.tsx` under the app |
