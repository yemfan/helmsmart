# CloseBoss demo mode

The demo account is the sandboxed agent **michael.yes@mail.com** (works
on prod `leadsmart-ai.com` and local dev). The seed paints a coherent
"Realtor with a working AI team" story with `now()`-relative
timestamps, so **re-running it before any demo makes "today" fresh**.

## Reset / refresh the demo

Run `closeboss-demo-seed.sql` against the LeadSmart Supabase project
(`babmbowmzwizoahkmshx`) as service role — via the Supabase MCP
`execute_sql`, the SQL editor, or psql. It is idempotent: it clears the
sandbox agent's CRM rows (and cached AI briefings) and reinserts the
story. `boss_recommendations` regenerate from live data on the first
dashboard load.

## The story the data tells

| Beat | Where it shows |
|---|---|
| Grace Liu called this morning; the AI Receptionist qualified her ($750k cash, relocating from Seattle) and created the lead | Boss digest strip, Hot Leads, AI Team Activity, Receptionist page |
| Jane Chen (pre-approved, score 92) texted; SMS Auto Pilot booked Saturday 11am and today's consultation is on the calendar | Hot Leads, priorities, SMS thread, Today's appointments |
| 87 Birchwood Ln closes in 2 days with wire verification still open | Transaction Health (at risk), wire-fraud activity (needs attention), top priority |
| 148 W Cherry Ave inspection contingency expires in 2 days | Transaction Health, priorities, calendar (+2d inspection) |
| Kevin O'Brien went quiet; the Sales Assistant ran a reactivation call + text | Reactivation queue, AI Team Activity |
| 3 overdue tasks (CMA for Maria Lopez, showing list for Jane…) | Overdue tasks card, priorities |

## Suggested walkthrough (~3 minutes)

1. **Land on the Boss Assistant** — greeting, the "Your AI team, last
   24h" strip, and five priorities with expected outcomes. Point out:
   nothing here is configuration; it's a chief of staff reporting in.
2. **Click Jane Chen** in Hot Leads — the person drawer: who she is,
   next best action, and the story-so-far timeline (her call, the AI
   text thread, the booked consultation).
3. **Open the AI Transaction Assistant** — Transaction Health cards:
   87 Birchwood Ln *At risk* (closing in 2 days, wire unverified),
   Cherry Ave *Needs attention* (inspection Friday), Maple Ct on track.
4. **Manage AI Team** — pause the Transaction Assistant, return to the
   Boss dashboard: its recommendations disappear. Re-activate. Toggle a
   Receptionist skill and note it rewrites the live phone playbook.
5. **"Ask your Boss Assistant…"** — open the bar and ask "What should I
   focus on today?"

## Caveats

- The morning/evening AI briefings generate on their cron schedule;
  right after a reseed they show "Awaiting first run" until the next
  cycle.
- Re-seeding deletes everything on the sandbox agent, including rows
  created live during a previous demo.
