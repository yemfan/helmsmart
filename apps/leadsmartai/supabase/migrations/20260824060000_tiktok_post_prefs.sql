-- TikTok Direct Post: the creator's own posting choices.
--
-- TikTok's Content Posting API requires that a HUMAN chooses the privacy level
-- and declares commercial content — a client may not decide either on the
-- creator's behalf, and may not default to public. CloseBoss publishes from a
-- cron, with nobody present at post time, so the choice is made once here and
-- replayed on every automated post.
--
-- Deliberately NULL by default. A connection with no recorded choice must not
-- post at all, rather than fall back to something the creator never picked.
-- That is the whole point of these columns: today the privacy level comes from
-- a TIKTOK_PRIVACY_LEVEL env var, which is exactly the "client decides" pattern
-- the audit rejects.

alter table public.social_accounts
  -- One of the values TikTok reported in privacy_level_options for THIS creator.
  -- Never written unless the creator picked it.
  add column if not exists tiktok_privacy_level text
    check (tiktok_privacy_level in (
      'PUBLIC_TO_EVERYONE',
      'MUTUAL_FOLLOW_FRIENDS',
      'FOLLOWER_OF_CREATOR',
      'SELF_ONLY'
    )),

  -- Interaction toggles. The creator's preference; the account-level setting
  -- from creator_info still overrides these at publish time, because an account
  -- with comments off must stay that way whatever is stored here.
  add column if not exists tiktok_disable_comment boolean not null default false,
  add column if not exists tiktok_disable_duet boolean not null default false,
  add column if not exists tiktok_disable_stitch boolean not null default false,

  -- Commercial-content disclosure. brand_organic = "your own brand",
  -- brand_content = "a paid partnership". TikTok forbids branded content on a
  -- private post, which the app enforces before it saves.
  add column if not exists tiktok_brand_organic boolean not null default false,
  add column if not exists tiktok_brand_content boolean not null default false,

  -- When the creator last confirmed the above, and what we showed them. An
  -- audit asks "did a human choose this"; without a timestamp the answer is
  -- only an assertion.
  add column if not exists tiktok_prefs_confirmed_at timestamptz,
  add column if not exists tiktok_creator_nickname text;

comment on column public.social_accounts.tiktok_privacy_level is
  'Creator-selected privacy level for automated posts. NULL = never chosen, so do not post.';
comment on column public.social_accounts.tiktok_prefs_confirmed_at is
  'When the creator last confirmed their TikTok posting choices.';
