"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Download, Loader2 } from "lucide-react";

/**
 * Icons for the "what's inside" list. The copy itself lives in
 * `web_free_tools.json` under `lead_magnet.items[]` ({ bold, rest }) —
 * only the emoji stays here, since it doesn't translate.
 */
const INSIDE_ICONS = ["✍️", "📲", "📊", "🎯"];

type Status = "idle" | "loading" | "done" | "error";

export default function PromptsLeadMagnet() {
  const { t } = useTranslation("web_free_tools");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading" || !emailValid) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/free-tools/prompts-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), email: email.trim(), lang, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; download?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        // The route's own `error` strings are English-only and carry no detail
        // beyond "it failed", so show the localized generic message instead.
        setError(t("lead_magnet.form.error_generic"));
        return;
      }
      setDownloadUrl(
        data.download ||
          (lang === "zh"
            ? "/downloads/RealtyBoss_5_AI_Prompts_ZH.pdf"
            : "/downloads/RealtyBoss_5_AI_Prompts.pdf"),
      );
      setStatus("done");
    } catch {
      setStatus("error");
      setError(t("lead_magnet.form.error_network"));
    }
  }

  return (
    <section
      aria-labelledby="lead-magnet-title"
      className="mt-10 overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-6 md:p-10 dark:border-blue-900/40 dark:from-blue-950/30 dark:via-slate-950 dark:to-slate-950"
    >
      <div className="grid items-center gap-8 md:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
            {t("lead_magnet.eyebrow")}
          </p>
          <h2
            id="lead-magnet-title"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl dark:text-white"
          >
            {t("lead_magnet.title")}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base dark:text-slate-300">
            {t("lead_magnet.body")}
          </p>

          {status === "done" ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
                {t("lead_magnet.success.heading")}
              </p>
              <p className="mt-1 text-sm text-emerald-700/90 dark:text-emerald-300/80">
                {t("lead_magnet.success.body")}
              </p>
              <a
                href={downloadUrl}
                download
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Download className="h-4 w-4" aria-hidden />
                {t("lead_magnet.success.download")}
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 max-w-md">
              {/* Honeypot: hidden from users, catches bots. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
                aria-hidden
              />
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  placeholder={t("lead_magnet.form.first_name_placeholder")}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <input
                  type="email"
                  required
                  placeholder={t("lead_magnet.form.email_placeholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div className="mt-3 flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
                <span className="font-medium">{t("lead_magnet.form.language_label")}</span>
                {/* Endonyms — a language picker names each language in its own
                    language, so these stay literal in every locale. */}
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="lang"
                    checked={lang === "en"}
                    onChange={() => setLang("en")}
                    className="accent-blue-600"
                  />
                  English
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="lang"
                    checked={lang === "zh"}
                    onChange={() => setLang("zh")}
                    className="accent-blue-600"
                  />
                  中文
                </label>
              </div>

              <button
                type="submit"
                disabled={status === "loading" || !emailValid}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                {t("lead_magnet.form.submit")}
              </button>

              {status === "error" ? (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t("lead_magnet.form.privacy_note")}
                </p>
              )}
            </form>
          )}
        </div>

        <ul className="space-y-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
          {INSIDE_ICONS.map((icon, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-0.5 text-base">{icon}</span>
              <span>
                <strong className="font-semibold">{t(`lead_magnet.items.${i}.bold`)}</strong>{" "}
                {t(`lead_magnet.items.${i}.rest`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
