# PropertyTools AI — UI design system

Shared with **CloseBoss** for a consistent family look: same brand blues (`#0072ce` / `#005ca8`), success green, and accent orange via `app/globals.css` (`@theme` + `:root`).

## Brand checkmarks (`components/brand/BrandCheck.tsx`)

Colored circular ✓ chips using **primary**, **primaryDark**, **success**, and **accent** (`BRAND` constant). Use for bullet lists (hero trust, pipeline, pricing features). For long lists, `toneAt(index)` cycles tones. **CloseBoss** uses the same component under `apps/leadsmartai/components/brand/BrandCheck.tsx`.

## Feature highlight cards (`components/ui/FeatureHighlightCard.tsx`)

Top **4px brand accent** + **gradient** into `slate-50` — same pattern as CloseBoss **“Close More Deals with Less Work”** (`#features`). Props: `accent` (`primary` | `primaryDark` | `success` | `accent`), `title`, `description`. Used on the **homepage** (“Make Smarter Decisions with AI”) and **pricing** value-prop row.

## Surfaces (`components/ui/Card.tsx`)

| Variant       | Use |
|---------------|-----|
| `default`     | Primary panels — border `slate-200/90`, soft ring + shadow. |
| `interactive` | Clickable tiles / links — hover lift + brand border tint. |
| `muted`       | Secondary blocks (testimonials, stats strips). |
| `flat` / `inset` | Lighter or nested panels. |

## Layout helpers

- **`AuthPageShell`** — login, signup, agent signup (radial brand glow + gradient).
- **`MarketingContentLayout`** — legal / simple content pages in a card on a gradient.
- **`ToolPageScaffold`** — calculator-style tool pages: “Back to Home”, blue `h1`, gray intro, `lg:grid-cols-3` (2/3 inputs + sticky 1/3 results), white `shadow-md` panels (same pattern as mortgage/refinance pages).
- **`AppShell`** — signed-in/tool chrome uses `bg-gray-50` + white sidebar; marketing home stays full-width white.
- **`PropertyToolsShell`** — optional demo/layout: `PremiumSidebar` + `PremiumTopbar` from `@repo/ui` (no `GlobalSearchBar` / `AccountMenu`). Use `AppShell` for production.
- **`/layout-preview`** — renders **`PremiumSidebar`** + **`PremiumTopbar`** from `@repo/ui` with production `nav.config` trees (PropertyTools + cross-import CloseBoss); `AppShell` skips chrome on this path; `robots: noindex`.

## Typography

- Headings: `font-heading` (Montserrat).
- Body: `font-body` / default body (Roboto).
- Section titles: `Section` supports optional `eyebrow` in brand color.

## Consistency checklist for new pages

1. Page background: gradient or `bg-white`; **`AppShell`** tool area intentionally uses `gray-50`.
2. Primary actions: `Button` default (brand blue), not ad-hoc `blue-600`.
3. Cards: use `Card` + variants instead of one-off `border rounded-xl bg-white`.
4. Links: `text-[#0072ce]` hover `#005ca8` (see `globals.css` `a` rules).
