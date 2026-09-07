# Conventions

House rules for this monorepo. They apply to **every app** — CloseBoss
(`apps/leadsmartai`), HelmSmart (`apps/helmsmart-web`), MarketingBoss
(`apps/marketingboss`), PropertyTools AI (`apps/propertytoolsai`), AI Business
Works (`apps/aibusinessworks`), MAXY (`apps/maxyinvestment`) and the mobile app.

Prefer the standard over a local invention. A screen that solves a solved
problem its own way costs the reader more than it saves the author: every
variation is something a user has to learn twice.

---

## UI

### Saving reports itself on the button

A control that saves and leaves the user on the same screen says so **in its own
label**, and clears after about 2.5 seconds:

```tsx
{isPending ? "Saving…" : saved ? "Saved!" : "Save changes"}
```

**Never render a separate success banner.** A panel that appears only after a
successful save inserts a line of layout and pushes the button the user just
clicked further down the page — the control moves at the moment they are looking
at it. Confirmation belongs where the action was.

The verb in the resting label is the screen's own ("Save changes", "Save rates",
"Save settings"). Only the confirmation is fixed: **`Saved!`**.

Reference implementations: `apps/helmsmart-web/components/voice-settings.tsx`,
`components/billing-rates-form.tsx`, `components/org-settings-form.tsx`.

**Errors are the exception, and they go below the control** — small rose text
with `role="alert"`:

```tsx
{error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
```

A failure is worth interrupting the layout for. A success is not.

#### Where this does not apply

- **Modals that close on save.** The dialog disappearing is the confirmation; a
  label flashing on an unmounting button is invisible.
- **Auth and one-shot flows** — sign-up, password reset, accepting an invite.
  The outcome is a durable instruction ("Check your email"), not a save, and it
  has to stay on screen.
- **Action buttons that are not saves** — Print, Send, Favorite, Approve. Name
  what happened to the thing, not "Saved!".

### Status is text, not a coloured slab

Information the app is telling you — a daily briefing, a summary, a count, a
"nothing needs you today" — is **body text in the page's own type and colour**.
Do not wrap it in a saturated gradient card with white type.

A slab like that outranks everything around it visually, so the eye lands on it
first regardless of what it says. On HelmSmart's dashboard the daily briefing
was an indigo-to-violet card above the KPI cards, which meant the loudest thing
on the page was usually the sentence "you're all caught up" — decoration
competing with the numbers the page exists to show.

Reserve colour for **state that differs from normal**: rose for errors, amber
for warnings, emerald for a confirmed change. Steady-state information gets
`text-slate-600`.

Light tints with a border (`from-indigo-50`, a `border-indigo-100`) used to
group a panel are fine — the problem is saturated fills with inverted type.

### Toggles

A sliding switch, **emerald-500 when on, slate-300 when off**, placed **directly
next to its label** — never pushed to the far edge by `justify-between`. A switch
far from its label neither reads as changeable nor makes its state obvious.

When the toggled thing has options, pair the switch with a separate **gear
button**: the switch answers "on or off?", the gear answers "configure it".

Reference: `apps/helmsmart-web/components/ui/toggle.tsx` —
`<Toggle checked onChange label />`.

### Don't ask for what nothing reads

Before adding a field, name the code that will read it. A setting that is stored
and never consulted is worse than an absent one: it asks the owner to make a
decision, implies the product will act on it, and then does not.
`organizations.fiscal_year_end_month` lived this way until it was removed — no
reader anywhere, only generated database types.

---

## Correctness

### A save that reports success must have changed a row

Through the RLS-enforced Supabase client, an update a policy forbids is **not an
error**. It matches zero rows and comes back clean, so "saved nothing" and
"saved" are the same value. Always ask for the rows back:

```ts
const { data, error } = await supabase
  .from("organizations").update(patch).eq("id", orgId)
  .select("id");           // ← load-bearing
if (!error && (!data || data.length === 0)) { /* refused, not saved */ }
```

HelmSmart has a helper that does this: `lib/actions/org-update.ts`. Use it for
organization writes rather than repeating the pattern.

This does not apply to the **service-role** client (`createServiceClient()`),
which bypasses RLS — there, zero rows means the id does not exist.

### Never leave a control showing a state the database does not hold

If a write is refused, put the switch back and say why. An optimistic toggle
that stays flipped after a rejected save is the same lie as a banner that says
"Saved." over an unchanged row.

---

## Verifying in a worktree

### Install before you believe a red test

A worktree under `.claude/worktrees/` has no `apps/<app>/node_modules` of its
own, so Node walks **up** and takes whatever the repo root has hoisted — which
is some *other* app's version. First thing, from the worktree root:

```bash
pnpm install --frozen-lockfile --filter <package>...
```

The trailing `...` is load-bearing: it pulls in the app's workspace
dependencies too. About 40 seconds, reuses the global store, downloads nothing.
Re-run it whenever a merge moves `pnpm-lock.yaml` or a `package.json`.

**`<package>` is the name in `package.json`, not the directory.** Two of them
differ, and `--filter` on the directory answers `No projects matched the
filters` rather than doing anything useful:

| directory | filter with |
| --- | --- |
| `apps/leadsmartai` | `leadsmartai` |
| `apps/helmsmart-web` | **`helmsmart`** |
| `apps/marketingboss` | `marketingboss` |
| `apps/propertytoolsai` | `propertytoolsai` |
| `apps/aibusinessworks` | `aibusinessworks` |
| `apps/maxyinvestment` | `maxyinvestment` |
| `apps/leadsmart-mobile` | `leadsmart-mobile` |
| `apps/helm-ui` | **`@helm/ui`** |

**Why this is a house rule and not a tip.** `apps/leadsmartai` and
`apps/helmsmart-web` pin `zod ^3.24.2`; `apps/propertytoolsai` pins `^4.3.6`.
Whichever the root hoists is what an uninstalled worktree gets, so either of
the first two can end up typechecked and run against **zod 4**, and you get
failures that belong to neither branch:

| symptom | actually |
| --- | --- |
| 16 `TS2769` in `lib/marketing-hub/config.ts` | `.default({})` takes the input type in zod 3, the output type in zod 4 |
| 4 `marketing-hub` test failures | same |
| 2 standing `lib/boss` `tsc` errors | same |
| `@types/dompurify` "is not a module" | same install gap |
| `toolOwnership.test.ts` roster is empty | zod internals moved between majors |

That table is `leadsmartai`'s symptom set, measured 2026-09-06. All of it
cleared with the one command — 19 type errors to **0**, vitest from five
failures to **217 files / 2266 tests green** — and none of it was ever a defect
on `main`. Any app in the table above can produce its own version of this;
the shape to recognise is *errors about a dependency you did not touch*.

### CI is a tie-breaker, not a substitute

The failures above were waved past for days as "a known worktree artifact, CI
is authoritative". That is the wrong lesson and it costs real signal: every one
of them was a legible error being ignored because the environment was wrong.

Install, then trust what `tsc` and `vitest` tell you. Reach for CI when local
and CI **disagree** — not as a reason to skip local verification, and never as
grounds to report a suite as passing when it did not.
