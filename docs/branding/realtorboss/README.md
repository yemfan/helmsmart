# RealtorBoss design sources

The vector masters and export sets behind artwork this monorepo still ships.
Until 2026-09-10 they lived only in `apps/RealtorBoss-Avatars/` and
`apps/RealtorBoss-Logo/` on one machine, untracked —
`apps/leadsmartai/REALTORBOSS_LEGACY.md` described them as "untracked design
sources on the owner's machine". **44 of the 61 files existed in no commit, on
no branch, anywhere in this repository's history.** Losing that machine would
have lost every editable source for the app icons and the Play Store listing.

They are here rather than in an app's `public/` because they are *inputs*: a
designer edits the SVG, exports, and copies the result to wherever it is
served. Nothing builds from this directory.

## The name

Three names, in order: **RealtorBoss** → RealtyBoss (2026-07) → **CloseBoss**
(2026-07-15, current). The kit keeps its original name because that is what it
is — renaming the folder would imply the artwork was redrawn, and it was not.
The rename history is in `../rename-runbook.md`; the deliberately-unrenamed
references are in `apps/leadsmartai/REALTORBOSS_LEGACY.md`.

"RealtorBoss" is not usable as a product name in any case: REALTOR® is a
National Association of REALTORS® collective mark.

## What is the source of what

Fourteen of these files are byte-identical to artwork the apps serve today.
Edit the source here, re-export, and copy to the destination:

| source | shipped as |
| --- | --- |
| `avatars/svg/avatar-{01,02,04…14}.svg` (13 files) | `apps/leadsmartai/public/avatars/avatar-NN.svg` |
| `logo/png/icon-color-512.png` | `apps/maxyinvestment/public/logos/realtorboss.png` |

### Three sources have drifted — the shipped file is newer

Measured 2026-09-10 against `main`. For these, the served asset was changed
without the change coming back here, so **the source is not the master any
more**. Re-derive from the shipped file before editing, or you will silently
revert someone's work:

| source | destination | state |
| --- | --- | --- |
| `avatars/svg/avatar-03.svg` | `apps/leadsmartai/public/avatars/avatar-03.svg` | shipped file differs |
| `logo/png/app-tile-512.png` | `apps/leadsmartai/app/apple-icon.png` | shipped file differs |
| `logo/RealtorBoss-app-icon-1024-square.png` | `apps/leadsmart-mobile/assets/adaptive-icon.png` | shipped file differs |

That drift is the argument for tracking these at all: while they sat untracked
on one machine, nothing could notice the two copies parting company.

The remaining 44 files are masters and exports with no copy anywhere in the
tree — the SVG logo set, the PNG render of every avatar, the favicon and
app-tile ladders, the brand sheet, and the Play Store assets.

## Play Store

`logo/play/` holds the Google Play listing artwork for **`com.realtybossai.app`**
— `developer-icon-512.png` and `play-header-4096x2304.jpg`. The header is a
one-off 4096×2304 image with no generator and no other copy. Signing details
for that package are separate; see the Android signing notes.

## Not the CloseBoss icon pipeline

Current CloseBoss icons are generated, not hand-exported:
`apps/leadsmartai/scripts/generate-brand-icons.mjs` rasterises
`apps/leadsmartai/public/brand/closeboss/closeboss-mark-master.png` into the
size ladder. Never hand-edit those outputs. This directory predates that
pipeline and is not wired into it.
