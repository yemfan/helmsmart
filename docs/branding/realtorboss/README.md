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

Fifteen of these files are byte-identical to artwork the apps serve today.
Edit the source here, re-export, and copy to the destination:

| source | shipped as |
| --- | --- |
| `avatars/svg/avatar-01…14.svg` (14 files) | `apps/leadsmartai/public/avatars/avatar-NN.svg` |
| `logo/png/icon-color-512.png` | `apps/maxyinvestment/public/logos/realtorboss.png` |

`avatar-03.svg` reached that state late. #937 warmed its background gradient
in the app — `#FAEEDA → #D7CAB6` pale beige became `#FFEAD1 → #E39A2E` gold —
and the edit never came back here, so for fourteen months the "source" would
have reverted a design decision on its next export. Synced from the shipped
file on 2026-09-10, which is the direction that fixes it: what ships is the
truth, and the kit follows.

### What this kit no longer sources

Two mappings that used to hold are dead, and nothing here should be treated as
their master:

| former destination | now produced by |
| --- | --- |
| `apps/leadsmartai/app/apple-icon.png` | `scripts/generate-brand-icons.mjs`, 180px from the **CloseBoss** master |
| `apps/leadsmart-mobile/assets/adaptive-icon.png` | the same generator, as a 1024 inset Android foreground |

Both were RealtorBoss exports until the CloseBoss icon work of 2026-08
(#1086, #1088, then 83c8702c "one master for the brand mark, so the generator
can't revert it"). They are CloseBoss artwork now, at different sizes from
anything in this folder — `apple-icon.png` is 180px where `logo/png/app-tile-512.png`
is 512. Copying a file from here over either one would put the wrong brand on
the icon and be reverted by the next generator run.

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
