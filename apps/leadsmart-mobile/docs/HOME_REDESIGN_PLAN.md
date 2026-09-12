# Mobile Home tab redesign — v1.6 plan

Mirrors the web app's `PremiumSidebarV2` organization
(`apps/leadsmartai/nav.config.tsx`) on the mobile Home tab. Bottom tab
bar stays as-is; this redesign only touches `(tabs)/index.tsx`.

Visual reference: card-tile grid with colored icon backgrounds, grouped
by supercategory (Work / Engage / Analyze / Manage), inspired by the
real-estate super-app style. **Branding is CloseBoss-only** — no
brokerage co-branding in v1.6 (see APP_STORE_REVIEW.md for the
trademark policy).

## Web → mobile feature mapping

Three buckets:

- ✅ **has mobile route** — gets a tile, taps into the existing screen
- 🌐 **web-only** — surfaced via a single "Open full dashboard on the
  web" footer link, not as a tile (avoids 15 tiles labeled "Coming
  soon" — bad UX, and Apple sometimes flags those as incomplete)
- ⏭️ **mobile-specific extras** — features that exist on mobile but
  aren't in the web nav (Briefings, Quick Post variants, Postcards).
  Placed in whichever supercategory fits.

| Web nav | Status | Mobile route / disposition |
|---|---|---|
| **Home** | ✅ | Top of Home tab (profile, stats, alerts, agenda) |
| **WORK** | | |
| → Leads / Contacts | ✅ | Bottom tab `Leads` (already a tab — not duplicated as a tile) |
| → Tasks | ✅ | `/tasks` |
| → Calendar | ✅ | Bottom tab `Calendar` |
| → Open Houses | 🌐 | web-only |
| → Lead Queue | 🌐 | web-only (admin/support only) |
| → Generate Leads | ✅ | `/quick-post` |
| **BUYERS** | | |
| → Showings | ✅ | `/showings` |
| → Offers | 🌐 | web-only |
| **SELLERS** | | |
| → Listings | 🌐 | web-only |
| → Presentations | 🌐 | web-only |
| **TRANSACTIONS** | | |
| → All deals | 🌐 | web-only |
| → Coordinator | 🌐 | web-only |
| **ENGAGE** | | |
| → Conversations | ✅ | Bottom tab `Inbox` |
| → Missed-call text-back | 🌐 | web-only |
| → Drafts | 🌐 | web-only |
| → Templates | 🌐 | web-only |
| → Marketing Plans | 🌐 | web-only |
| → Sales Model | 🌐 | web-only |
| → Playbooks | 🌐 | web-only |
| ⏭️ Postcards | ✅ | `/postcards` |
| ⏭️ Scheduled posts | ✅ | `/scheduled` |
| ⏭️ Recurring posts | ✅ | `/recurring` |
| ⏭️ Post history | ✅ | `/post-history` |
| **ANALYZE** | | |
| → Performance | 🌐 | web-only |
| → Coaching | ✅ | `/coaching` |
| → Sphere monetization | ✅ | `/sphere` |
| → Growth & Opportunities | 🌐 | web-only |
| → Property Tools / All tools | 🌐 | web-only |
| → CMAs | ✅ | `/cma` |
| ⏭️ Briefings | ✅ | `/briefings` |
| **MANAGE** | | |
| → Settings | ✅ | Bottom tab `Settings` |
| → Billing | 🌐 | web-only |
| → Profile | 🌐 | web-only |
| → Support | 🌐 | web-only (mailto fallback) |
| ⏭️ Notifications | ✅ | `/notifications` |
| ⏭️ Connect platforms | ✅ | `/connect-platforms` |

## Final tile layout

Tiles only for ✅ items that aren't already in the bottom tab bar
(Inbox / Leads / Calendar / Settings are excluded — agents reach them
via the persistent tab bar; duplicating wastes precious tile real
estate).

```
┌─ Home (no section label, hero block) ──────────────┐
│ Profile header (avatar + name + plan badge)         │
│ Stats row (hot leads / tasks today / unread / reply │
│ rate)                                                │
│ Today's Hot Lead Alert card  ← existing component   │
│ Daily Agenda card            ← existing component   │
└──────────────────────────────────────────────────────┘

WORK
┌──────┐ ┌──────┐ ┌──────┐
│Tasks │ │Show- │ │Quick │
│      │ │ings  │ │Post  │
└──────┘ └──────┘ └──────┘

ENGAGE
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│Post- │ │Sched-│ │Recur-│ │Post  │
│cards │ │uled  │ │ring  │ │histry│
└──────┘ └──────┘ └──────┘ └──────┘

ANALYZE
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│CMA   │ │Sphere│ │Coach-│ │Brief-│
│      │ │      │ │ing   │ │ings  │
└──────┘ └──────┘ └──────┘ └──────┘

MANAGE
┌──────┐ ┌──────┐
│Noti- │ │Conn- │
│fica- │ │ect   │
│tions │ │plat- │
└──────┘ └──────┘

[ Open full dashboard on the web → ]
```

Total: 13 tiles in 4 grouped sections, ~3 tiles per row, all linking
to existing mobile screens. Web-only features funnel through the
footer link.

## Tile visual spec

Each tile:

```
┌────────────────────┐
│  ╭──╮              │   color: per-section accent
│  │🗒│   ← icon     │     - Work: blue
│  ╰──╯              │     - Engage: emerald
│  Tasks             │     - Analyze: violet
└────────────────────┘     - Manage: slate

  optional HOT/VIP badge in top-right corner
```

- 80px tile height (3-col grid on iPhone widths 320-430)
- 44px icon container with `bg-<color>/10` background + `text-<color>`
  lucide icon at stroke 1.75 (matches web sidebar weight)
- Tile background: `surface` token (white in light mode, slate-900 in
  dark), 1px `border` token, 16px radius
- Pressed state: opacity 0.85 + light haptic
- Optional badge: rounded-pill, top-right, `bg-amber-500` for VIP,
  `bg-rose-500` for HOT, 9px text

## Out of scope for v1.6

- Custom brokerage co-branding (deferred — would require asset
  storage, EULA changes, separate marketing per brokerage)
- "More" overflow tiles with web-only previews (web-only stuff
  consolidates under one footer link instead)
- Reordering / customizing tile layout per agent
- Tile-level analytics ("show what I tap most" — possible v1.7+)
- Bottom tab bar changes (Inbox / Leads / Calendar stay as tabs)
