-- Where the intro video's extracted audio track lives.
--
-- Voice cloning only ever needed the audio, but we were uploading the whole
-- video. ElevenLabs caps an upload at 11MB and a normal intro video is ~18MB,
-- so the sample had to be shrunk — and the way we shrank it was ElevenLabs'
-- audio-isolation endpoint, which is a DENOISER. It fits under the cap but
-- reshapes the voice, and the resulting clones came back sounding processed.
--
-- The audio track is now extracted in the browser at upload time (a minute of
-- speech is ~1-2MB as mono WAV), so cloning gets a small, completely
-- unprocessed sample and isolation goes back to being a genuine opt-in
-- enhancement rather than a size workaround.
--
-- Nullable on purpose: rows predating this, and browsers that can't decode the
-- container, simply don't have one and fall back to the video.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS dt_intro_audio_path text;

COMMENT ON COLUMN public.agents.dt_intro_audio_path IS
  'Private storage path (lead-media/digital-twin/{agent_id}/...) of the audio track extracted from the intro video, used as the voice-clone sample. Same own-likeness + consent gate as dt_intro_video_path.';
