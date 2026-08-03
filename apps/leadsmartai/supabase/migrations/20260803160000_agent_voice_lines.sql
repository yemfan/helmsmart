-- Cloned voice on phone calls: cache the fixed TwiML voice-lines (greeting,
-- reprompt, closing, fallback) pre-rendered in the agent's cloned voice so the
-- webhook can <Play> them (with a <Say> fallback). Shape:
--   { "voiceId": "<elevenlabs voice id>", "urls": { "<line key>": "<public mp3 url>" } }
-- Only used when use_cloned_voice is on AND voiceId matches the current clone.
alter table public.agent_voice_settings
  add column if not exists voice_lines jsonb;
