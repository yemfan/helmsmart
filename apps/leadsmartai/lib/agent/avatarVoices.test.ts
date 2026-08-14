import { describe, expect, it } from "vitest";
import { AVATAR_PRESET_VOICES, CLONE_VOICE_ID, isPresetVoiceId } from "./avatarVoices";
import { findPreset } from "@/lib/agent-voice/presets";

/**
 * The avatar voice picker offers these ids straight to the user, and the server
 * resolves them back through `findPreset("elevenlabs", id)` at synth time. If
 * the two ever disagree, the failure surfaces as a mid-render error after the
 * agent has already spent credits — so pin the contract here instead.
 */
describe("avatar voice catalog", () => {
  it("offers at least one stock voice", () => {
    // An empty catalog would silently reduce the picker to clone-only, which is
    // exactly the limitation it exists to remove.
    expect(AVATAR_PRESET_VOICES.length).toBeGreaterThan(0);
  });

  it("every offered voice resolves to a real ElevenLabs voice id", () => {
    for (const v of AVATAR_PRESET_VOICES) {
      const resolved = findPreset("elevenlabs", v.id)?.elevenLabsVoiceId?.trim();
      expect(resolved, `${v.id} (${v.label}) has no ElevenLabs voice id`).toBeTruthy();
    }
  });

  it("gives every voice a label and a hint", () => {
    for (const v of AVATAR_PRESET_VOICES) {
      expect(v.label.trim(), `${v.id} has no label`).toBeTruthy();
      expect(v.hint.trim(), `${v.id} has no hint`).toBeTruthy();
    }
  });

  it("keeps the clone sentinel distinct from every preset id", () => {
    // resolveVoiceId branches on this exact string; a collision would route a
    // stock-voice request into the clone path (or vice versa).
    expect(isPresetVoiceId(CLONE_VOICE_ID)).toBe(false);
    expect(findPreset("elevenlabs", CLONE_VOICE_ID)).toBeNull();
  });

  it("recognises its own ids and rejects unknown ones", () => {
    expect(isPresetVoiceId(AVATAR_PRESET_VOICES[0]!.id)).toBe(true);
    expect(isPresetVoiceId("elevenlabs_not_a_voice")).toBe(false);
    expect(isPresetVoiceId("")).toBe(false);
  });
});
