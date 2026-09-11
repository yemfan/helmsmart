-- A client brief is prose the AI wrote in one language: the language of the
-- person who asked for it. Record which, so a Spanish reader is not served a
-- brief cached in English (or the reverse). getClientBrief treats a brief in
-- another language as absent, and the reader regenerates it in theirs.
--
-- Nullable with no backfill: every brief written before this column existed
-- was requested before briefs followed the reader, and reads as English.
ALTER TABLE client_ai_briefs ADD COLUMN IF NOT EXISTS locale TEXT;
