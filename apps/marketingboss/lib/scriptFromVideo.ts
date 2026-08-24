import "server-only";
import { anthropicJson } from "@/lib/ai";
import { transcribeMedia } from "@/lib/transcribeMedia";

/**
 * Write what the twin should say, from what the person already said.
 *
 * The twin panel shipped with a hard-coded sample line, so the first thing
 * anyone films is a stranger's sentence in their own face and voice. They have
 * already recorded themselves explaining what they do - the words are sitting
 * in the intro video.
 *
 * Modelled on CloseBoss's draftAvatarScript (lib/agent/avatarStudio.ts), which
 * runs this in production: same ~20-30s target, same refusal to invent claims.
 * The difference is the source - CloseBoss drafts from a saved brand profile,
 * which a MarketingBoss user may not have filled in, so this reads the intro
 * video's own transcript and treats the Brand Kit as optional colour.
 *
 * Language follows the speaker. CloseBoss had to be repaired for this once
 * (#1237: the voice was always multilingual, only the prompt was English-
 * locked), and writing an English script for someone who spoke Chinese into
 * their own cloned voice is the same failure with a different accent.
 *
 * Suggestion only, and returned rather than saved: this is the sentence the
 * user is about to appear on camera saying, so it lands in the box for editing.
 */

export type ScriptFromVideo = {
  /** A line to say to camera, in their own register and language. */
  script: string;
  /** What was heard, so the suggestion can be judged against it. */
  transcript: string;
};

const SCHEMA = {
  type: "object",
  properties: { script: { type: "string" } },
  required: ["script"],
  additionalProperties: false,
};

/**
 * Transcribe `mediaUrl` and draft a spoken line from it.
 *
 * Throws when there is too little speech, rather than inventing a message out
 * of silence - a confident script about a business we heard nothing about is
 * worse than saying the video had no words in it.
 */
export async function scriptFromVideo(
  mediaUrl: string,
  opts: { brandName?: string; voice?: string; topic?: string } = {},
): Promise<ScriptFromVideo> {
  const transcript = await transcribeMedia(mediaUrl);
  if (transcript.length < 80) {
    throw new Error(
      "There wasn't enough speech in that video to write from. Try a clip where you talk for 20 seconds or more.",
    );
  }

  const system = [
    "You write a SHORT script for someone to say straight to camera in a talking-head video, about 20-30 seconds.",
    "You are given a transcript of that same person talking. Write in THEIR register - the words, rhythm and plainness you can hear in it. It has to sound like them, not like an ad.",
    "",
    "Language: write in the SAME language the transcript is in. If they spoke Simplified Chinese, write natural spoken Mandarin as they would actually say it to camera - not a translation of English phrasing - and aim for 90-140 characters. If they spoke English, aim for 55-85 words. Keep proper nouns in the form they used.",
    "",
    "Rules:",
    "- First person.",
    "- Say only what the transcript supports. Do not invent services, results, numbers, locations or credentials that were not spoken.",
    "- No marketing cliches, and no rhetorical question as an opener.",
    "- Plain punctuation - this is read aloud, not printed.",
    "- Return the script only. No title, no stage directions, no quotation marks around it.",
  ].join("\n");

  const context = [
    opts.brandName ? `Business name: ${opts.brandName}` : "",
    opts.voice ? `Tone of voice to match: ${opts.voice}` : "",
    `Topic for this video: ${opts.topic?.trim() || "a warm general introduction to who I am and how I help people"}`,
    "",
    `Transcript of them speaking:\n\n${transcript.slice(0, 6000)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const out = await anthropicJson<{ script: string }>({
    system,
    user: context,
    schema: SCHEMA,
    maxTokens: 600,
  });

  return { script: (out.script || "").trim().slice(0, 1200), transcript };
}
