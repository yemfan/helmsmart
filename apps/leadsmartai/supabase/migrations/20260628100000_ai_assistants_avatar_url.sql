-- Custom uploaded avatar per assistant. When set, avatar_url (a public URL in
-- the `avatars` storage bucket) overrides the persona avatar_id. Picking a
-- built-in persona clears avatar_url (handled in updateAssistantForAgent).

alter table public.ai_assistants
  add column if not exists avatar_url text;

comment on column public.ai_assistants.avatar_url is
  'Custom uploaded avatar URL (avatars storage bucket). Overrides avatar_id when set.';
