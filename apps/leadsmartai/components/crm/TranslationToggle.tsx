"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LocaleId } from "@/lib/locales/registry";

/**
 * Per-message "show English translation" toggle. Shown inline under a
 * message bubble whenever the bubble's content is in a non-English
 * locale (caller decides when to render it — this component is dumb and
 * doesn't inspect the text).
 *
 * Behavior:
 *   - idle: button reads "Translate to English" (or target label)
 *   - loading: shows t("common:status.translating") and disables the button
 *   - showing: renders the translated text + a "Hide translation" link
 *   - error: shows the error message + retry button
 *
 * Caching happens server-side in `message_translation_cache`, so
 * toggling "hide" then "translate" again on the same message hits cache
 * and is instant after the first call. We deliberately don't cache in
 * component state beyond the current mount — a page refresh still shows
 * the toggle in its default collapsed state, which matches how
 * read-your-email UIs elsewhere behave.
 */
export function TranslationToggle({
  text,
  targetLocale,
  sourceLocale,
  targetLabel = "English",
}: {
  text: string;
  /** The locale to translate INTO (usually the agent's UI language). */
  targetLocale: LocaleId;
  /** Optional hint about the source; speeds up + stabilizes the LLM. */
  sourceLocale?: LocaleId | null;
  /** Display label for the target. Defaults to "English". */
  targetLabel?: string;
}) {
  const { t } = useTranslation("dashboard");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "showing"; translated: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function translate() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          targetLocale,
          sourceLocale: sourceLocale ?? undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        translated?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || typeof json.translated !== "string") {
        setState({
          kind: "error",
          message: json.error ?? "Translation failed.",
        });
        return;
      }
      setState({ kind: "showing", translated: json.translated });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error.",
      });
    }
  }

  if (state.kind === "showing") {
    return (
      <div className="mt-1.5 border-l-2 border-slate-300 pl-3 text-[13px] text-slate-600">
        <div className="whitespace-pre-wrap">{state.translated}</div>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="mt-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
        >{t("pages.misc.hideTranslation")}</button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mt-1 flex items-center gap-2 text-[11px]">
        <span className="text-red-700">{state.message}</span>
        <button
          type="button"
          onClick={() => {
            void translate();
          }}
          className="font-medium text-slate-600 hover:text-slate-900 underline"
        >{t("pages.misc.retry")}</button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        void translate();
      }}
      disabled={state.kind === "loading"}
      className="mt-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 disabled:opacity-60"
    >
      {state.kind === "loading" ? t("common:status.translating") : `Translate to ${targetLabel}`}
    </button>
  );
}
