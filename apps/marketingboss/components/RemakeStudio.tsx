"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AdBlueprint, RecastPlan } from "@/lib/adBlueprint";
import { estimateSpeechSeconds, findOverrunningShots } from "@/lib/speechTiming";

/**
 * Remake — re-shoot a reference ad with the user's own twin.
 *
 * The alternative to Swap, and it exists because Swap structurally cannot do
 * this. Swap is a video-to-video edit: it inherits the source's length (3-10s,
 * so a 30s ad gets cut to 9), keeps the source's audio, and re-renders a face
 * over motion filmed for someone else — and when the chosen seconds contain a
 * shot with nobody in frame, the model invents a person rather than skipping it.
 *
 * Remake stops editing footage. It reads the reference's STRUCTURE, then
 * rebuilds every shot: the presenter's shots from their own portrait and voice,
 * the rest generated from scratch. Nothing of the reference's pixels survives,
 * which is also why it can be any length.
 *
 * Three stages, each shown before the next runs, because each one costs
 * something different: analysing costs a Claude call, planning costs another,
 * and only rendering costs credits.
 */

type Character = {
  id: string;
  name: string;
  role: string | null;
  identity_type: "fictional" | "real_person" | "brand_owned";
  reference_images: string[] | null;
};

type Rendered = { url: string; shots: { index: number; render: string; url: string }[]; notes: string[] };

type Stage = "idle" | "sampling" | "analysing" | "planning" | "rendering";

/** Kept well under the ~4.5MB body cap once base64-encoded. */
const MAX_FRAMES = 16;
const MAX_BYTES = 200 * 1024 * 1024;

function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    let settled = false;
    const finish = (v: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(v);
    };
    // A source the browser cannot decode fires neither loadedmetadata nor
    // error, so never resolve-or-hang — always resolve.
    const timer = setTimeout(() => finish(null), 5000);
    el.onloadedmetadata = () => {
      clearTimeout(timer);
      finish(Number.isFinite(el.duration) ? el.duration : null);
    };
    el.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    el.src = url;
  });
}

export default function RemakeStudio() {
  const supabase = createClient();
  const [uid, setUid] = useState<string | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [twinId, setTwinId] = useState("");
  const [makingTwin, setMakingTwin] = useState(false);
  const [business, setBusiness] = useState("");
  const [market, setMarket] = useState("");
  const [offer, setOffer] = useState("");

  const [refName, setRefName] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<AdBlueprint | null>(null);
  const [plan, setPlan] = useState<RecastPlan | null>(null);
  const [rendered, setRendered] = useState<Rendered | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, [supabase]);

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((d) => {
        const list: Character[] = d.characters ?? [];
        setCharacters(list);
        // Default to a real-person character with a photo — the only kind that
        // can legally and technically be the on-camera twin.
        const twin = list.find((c) => c.identity_type !== "fictional" && (c.reference_images ?? []).length);
        if (twin) setTwinId(twin.id);
      })
      .catch(() => setCharacters([]));
  }, []);

  const busy = stage !== "idle";

  /**
   * Bring the profile twin in as a character.
   *
   * Everything downstream of a remake is keyed on a character, so a user who
   * set up a twin still met an empty dropdown here and was asked to describe
   * themselves again in Character Studio's vocabulary.
   */
  async function useMyTwin() {
    setError(null);
    setMakingTwin(true);
    try {
      const res = await fetch("/api/characters/from-twin", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; character?: Character; error?: string }
        | null;
      if (!res.ok || !data?.ok || !data.character) {
        throw new Error(data?.error || "Couldn't bring your twin in.");
      }
      setCharacters((prev) => [data.character as Character, ...prev.filter((c) => c.id !== data.character!.id)]);
      setTwinId(data.character.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't bring your twin in.");
    } finally {
      setMakingTwin(false);
    }
  }

  async function onPickReference(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) return setError("Pick a video file.");
    if (file.size > MAX_BYTES) return setError("That file is over 200MB — export a smaller version.");
    if (!uid) return setError("Still signing in — try again in a second.");

    setError(null);
    setBlueprint(null);
    setPlan(null);
    setRendered(null);
    setRefName(file.name);

    try {
      const durationSec = await readDuration(file);
      if (!durationSec) throw new Error("That clip's length couldn't be read — try re-exporting it as MP4.");

      // Cuts and frames both come from the browser: fal's ffmpeg cannot seek,
      // and a real ffmpeg is far too heavy for a serverless function.
      setStage("sampling");
      const { detectCuts, sampleShotFrames } = await import("@/lib/trimClient");
      const cuts = await detectCuts(file);
      const frames = (await sampleShotFrames(file, durationSec, cuts)).slice(0, MAX_FRAMES);
      if (frames.length < 4) throw new Error("Couldn't read enough frames from that clip.");

      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const path = `${uid}/src/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const videoUrl = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;

      setStage("analysing");
      const res = await fetch("/api/remake/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, durationSec, cuts, frames }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That reference couldn't be read.");
      setBlueprint(data.blueprint as AdBlueprint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong reading that clip.");
    } finally {
      setStage("idle");
    }
  }

  async function writePlan() {
    if (!blueprint) return;
    setError(null);
    setStage("planning");
    try {
      const res = await fetch("/api/remake/recast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprint, characterId: twinId, business, market, offer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That plan couldn't be written.");
      setPlan(data.plan as RecastPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStage("idle");
    }
  }

  async function render() {
    if (!plan) return;
    setError(null);
    setStage("rendering");
    try {
      const res = await fetch("/api/remake/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, characterId: twinId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The ad couldn't be finished.");
      setRendered({ url: data.url, shots: data.shots ?? [], notes: data.notes ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStage("idle");
    }
  }

  const twin = characters.find((c) => c.id === twinId);
  const twinUsable = !!twin && twin.identity_type !== "fictional" && !!(twin.reference_images ?? []).length;
  /**
   * Edit a spoken line in place.
   *
   * The plan is a draft, not a verdict: the length warning below tells you a
   * line is too long for its slot, and until now there was nothing to do about
   * it but re-plan and hope. Only `line` is editable - the shot's seconds,
   * framing and camera come from the reference and are what keep the remake
   * faithful to it.
   */
  function editLine(index: number, line: string) {
    setPlan((cur) =>
      cur ? { ...cur, shots: cur.shots.map((s) => (s.index === index ? { ...s, line } : s)) } : cur,
    );
  }

  // Recomputed from the edited lines, so the warning clears as you trim rather
  // than sitting there stale from the original plan.
  const overruns = plan ? findOverrunningShots(plan.shots) : [];
  // Editing introduces a failure the planner could not produce: a spoken shot
  // with no words. Fabric drives the portrait FROM the voice track, so an
  // empty line is not a silent beat - there is nothing to render. Block the
  // render rather than let it fail several minutes in.
  const emptySpoken = plan
    ? plan.shots.filter((sh) => sh.render === "avatar" && !sh.line.trim()).map((sh) => sh.index + 1)
    : [];

  const spokenScript = plan
    ? plan.shots
        .filter((sh) => sh.render === "avatar" && sh.line.trim())
        .map((sh) => sh.line.trim())
        .join(" ")
    : "";
  const overrunByIndex = new Map(overruns.map((o) => [o.index, o]));

  const avatarShots = plan?.shots.filter((s) => s.render === "avatar").length ?? 0;
  const sceneShots = plan?.shots.filter((s) => s.render === "scene").length ?? 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Point at an ad that works and rebuild it as your own — same structure and pacing, your face, your
        voice, your words. Nothing of the original footage is reused, so it isn&apos;t limited to 10 seconds.
      </p>

      {/* 1 · reference */}
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">1 · Reference ad</span>
          {refName && <span className="max-w-[50%] truncate text-xs text-slate-500">{refName}</span>}
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
        >
          {stage === "sampling" ? "Reading the shots…" : stage === "analysing" ? "Analysing…" : "Upload a clip"}
        </button>
        <input ref={fileRef} type="file" accept="video/*" onChange={onPickReference} className="hidden" />
        <p className="mt-2 text-[11px] text-slate-400">
          Any length. We read its shot list, pacing and script — we never reuse its pictures.
        </p>
      </div>

      {/* 2 · blueprint */}
      {blueprint && (
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-600">
            2 · What this ad does · {blueprint.shots.length} shots · {blueprint.durationSec.toFixed(1)}s
          </div>
          <dl className="space-y-1 text-xs text-slate-600">
            <div>
              <dt className="inline font-medium text-slate-500">Arc: </dt>
              <dd className="inline">{blueprint.arc}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-slate-500">Format: </dt>
              <dd className="inline">{blueprint.formatDna}</dd>
            </div>
          </dl>
          <ol className="mt-2 space-y-1">
            {blueprint.shots.map((s) => (
              <li key={s.index} className="flex gap-2 text-[11px] text-slate-500">
                <span className="w-20 shrink-0 tabular-nums">
                  {s.startSec.toFixed(1)}–{s.endSec.toFixed(1)}s
                </span>
                <span className="w-14 shrink-0 font-medium">{s.presenterFraming}</span>
                <span className="truncate">{s.setting}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 3 · who + what */}
      {blueprint && (
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-600">3 · Who&apos;s in it, and about what</div>
          <select
            value={twinId}
            onChange={(e) => setTwinId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Choose your on-camera twin…</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.role ? ` — ${c.role}` : ""}
                {c.identity_type === "fictional" ? " (invented — can't go on camera)" : ""}
              </option>
            ))}
          </select>
          {!characters.some((c) => c.identity_type !== "fictional" && (c.reference_images ?? []).length) && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <p className="text-[11px] text-slate-600">
                Nothing here yet. If you have set up your twin on your profile, bring it in as a
                character — same face, same cloned voice, no need to describe yourself twice.
              </p>
              <button
                onClick={() => void useMyTwin()}
                disabled={busy || makingTwin}
                className="mt-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:text-slate-900 disabled:opacity-40"
              >
                {makingTwin ? "Setting it up…" : "Use my twin"}
              </button>
            </div>
          )}
          {twinId && !twinUsable && (
            <p className="mt-1 text-[11px] text-amber-700">
              An invented character can&rsquo;t appear on camera. Use one marked as your own likeness or as
              your brand persona, with a photo.
            </p>
          )}
          <div className="mt-2 grid gap-2">
            <input
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              placeholder="What you do (e.g. real estate agent in Malibu)"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              placeholder="Who it's for"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="What you want them to do"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={writePlan}
            disabled={busy || !twinUsable}
            className="mt-3 rounded-lg bg-boss-violet px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-40"
          >
            {stage === "planning" ? "Writing the plan…" : "Write my version"}
          </button>
        </div>
      )}

      {/* 4 · plan */}
      {plan && (
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-600">
            4 · Your version · {plan.totalSeconds.toFixed(1)}s · {avatarShots} on camera, {sceneShots} generated
          </div>
          {/* Derived from the shots, not the planner's script field, so it
              tracks edits instead of showing the version you replaced. */}
          <p className="mb-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{spokenScript || plan.script}</p>
          <ol className="space-y-2">
            {plan.shots.map((s) => (
              <li key={s.index} className="rounded-lg border border-slate-100 p-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${
                      s.render === "avatar" ? "bg-boss-gold/20 text-amber-900" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {s.render === "avatar" ? "You, on camera" : "Generated scene"}
                  </span>
                  <span className="tabular-nums text-slate-400">{s.seconds.toFixed(1)}s</span>
                </div>
                {s.render === "avatar" ? (
                  <>
                    <textarea
                      value={s.line}
                      onChange={(e) => editLine(s.index, e.target.value)}
                      rows={2}
                      aria-label={`Line for shot ${s.index + 1}`}
                      className={`mt-1 w-full resize-y rounded-md border px-2 py-1 text-[11px] text-slate-700 ${
                        overrunByIndex.has(s.index) ? "border-amber-400 bg-amber-50/40" : "border-slate-200"
                      }`}
                    />
                    <p className="mt-0.5 tabular-nums text-slate-400">
                      about {estimateSpeechSeconds(s.line).toFixed(1)}s of speech in a {s.seconds.toFixed(1)}s shot
                      {overrunByIndex.has(s.index) ? " — trim it, or the ad runs longer than planned" : ""}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-slate-600">{s.line || s.prompt}</p>
                )}
                <p className="mt-0.5 text-slate-400">{s.reason}</p>
              </li>
            ))}
          </ol>
          {/* The planner's own length note is dropped once the lines are
              editable - it was computed from the draft and goes stale the
              moment you type. The live per-shot readout replaces it. */}
          {plan.notes
            .filter((n) => !n.includes("more words than their slot"))
            .map((n) => (
              <p key={n} className="mt-2 text-[11px] text-amber-700">
                {n}
              </p>
            ))}
          {overruns.length > 0 && (
            <p className="mt-2 text-[11px] text-amber-700">
              {overruns.length} spoken shot{overruns.length === 1 ? "" : "s"} still run long. A spoken shot
              lasts as long as its audio, so the ad will come out longer than the reference unless you trim
              them.
            </p>
          )}
          <button
            onClick={render}
            disabled={busy || emptySpoken.length > 0}
            className="mt-3 rounded-lg bg-boss-violet px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-40"
          >
            {stage === "rendering" ? "Filming…" : "Film it"}
          </button>
          {emptySpoken.length > 0 && (
            <p className="mt-1 text-[11px] text-amber-700">
              Shot{emptySpoken.length === 1 ? "" : "s"} {emptySpoken.join(", ")} have no words. A shot of you on
              camera is filmed from your voice, so it needs a line — write one, or there is nothing to film.
            </p>
          )}
          {stage === "rendering" && (
            <p className="mt-1 text-[11px] text-slate-400">
              Each shot renders in turn, so this takes a few minutes. Keep this tab open.
            </p>
          )}
        </div>
      )}

      {/* 5 · result */}
      {rendered && (
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-600">5 · Your ad</div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={rendered.url} controls className="w-full rounded-lg" />
          {rendered.notes.map((n) => (
            <p key={n} className="mt-2 text-[11px] text-amber-700">
              {n}
            </p>
          ))}
          {rendered.shots.length > 1 && (
            <p className="mt-2 text-[11px] text-slate-400">
              Each shot was also kept on its own, so a single bad one can be re-rolled without re-filming the
              rest.
            </p>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
