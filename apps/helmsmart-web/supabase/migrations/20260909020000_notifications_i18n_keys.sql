-- ============================================================
-- notifications: store WHAT HAPPENED, not a sentence in one language.
-- ============================================================
-- The bell renders `notifications.title` and `.body` verbatim. Those columns
-- hold a sentence that was composed in English at the moment the event
-- happened — "Invoice INV-1042 was paid", "Approval needed" — so translating
-- the UI can never reach them. A Spanish-reading owner opens a fully Spanish
-- dashboard and finds an English list inside the bell, and no amount of bundle
-- work fixes it, because the text was frozen at write time.
--
-- The fix is to write a KEY plus its PARAMS and render at read time, when the
-- reader's language is finally known. `title_key` names a key in the app's
-- `notifications` namespace; `params` carries the interpolation values
-- ({"number": "INV-1042", "amount": "$1,200.00"}).
--
-- EXPAND, DON'T REPLACE. `title` and `body` stay, still NOT NULL, and every
-- writer keeps filling them with English. That is deliberate on two counts:
--   * the 88 rows that already exist have no key and must keep rendering;
--   * a row whose key is missing from a bundle still has a sentence to show,
--     so a typo degrades to English rather than to a blank line.
-- The renderer prefers the key and falls back to the stored text.
--
-- Nullable with no default, so nothing needs backfilling and an old writer
-- that has not been updated yet keeps working unchanged.
-- Idempotent.
-- ============================================================

alter table notifications
  add column if not exists title_key text,
  add column if not exists body_key  text,
  add column if not exists params    jsonb;

comment on column notifications.title_key is
  'i18n key in the app''s `notifications` namespace. When set, the bell renders this instead of `title`, interpolating `params`. `title` remains the English fallback for rows written before this column existed.';
