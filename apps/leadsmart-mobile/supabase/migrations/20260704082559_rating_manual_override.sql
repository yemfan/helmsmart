-- Auto-rating v1: engagement_score → rating, with manual override escape hatch.
--
-- The nightly behavior-score cron maps engagement_score to A/B/C/D and
-- writes it to contacts.rating. For cases where the agent's judgment
-- beats the model (they've met the lead in person, know context the
-- behavior graph doesn't), flipping rating_manual_override=true on a
-- row pins the current rating — the cron will skip that row until the
-- override is cleared.
--
-- Audit trail for every auto-rating change lives in contact_events
-- (event_type='rating_changed'), so agents can see when + why a rating
-- moved without needing a separate table.

alter table public.contacts
  add column if not exists rating_manual_override boolean not null default false;
