"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PostcardTemplateKey } from "@/lib/postcards/templates";

/**
 * Animated postcard scenes. Each takes the same props so the public
 * viewer page can render any template generically.
 *
 * CSS keyframes only — zero dependencies, small bundle, works on
 * every device. Lottie/video could replace these later without
 * changing the viewer page's wiring.
 *
 * Each animation plays once on mount (or loops gently), then the
 * message + signature fade in.
 */

type SceneProps = {
  recipientName: string;
  personalMessage: string;
  agentName: string | null;
  agentPhotoUrl: string | null;
  brandName: string | null;
};

export function PostcardScene({
  templateKey,
  ...props
}: SceneProps & { templateKey: PostcardTemplateKey }) {
  switch (templateKey) {
    case "birthday":
      return <BirthdayScene {...props} />;
    case "anniversary":
      return <AnniversaryScene {...props} />;
    case "holiday_seasonal":
      return <HolidayScene {...props} />;
    case "thinking_of_you":
    default:
      return <ThinkingScene {...props} />;
  }
}

/**
 * Shared message + signature block that appears below every animation.
 * Fades in after the animation has had time to play.
 */
function MessageBlock({
  personalMessage,
  agentName,
  agentPhotoUrl,
  brandName,
  delayMs = 1200,
}: {
  personalMessage: string;
  agentName: string | null;
  agentPhotoUrl: string | null;
  brandName: string | null;
  delayMs?: number;
}) {
  const { t } = useTranslation("dashboard");
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Named `timer`, not `t` — the translator above owns that name now.
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return (
    <div
      className={`mx-auto mt-8 max-w-xl transform px-4 transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <p className="whitespace-pre-line text-base leading-relaxed text-slate-800 md:text-lg">
        {personalMessage}
      </p>
      <div className="mt-6 flex items-center gap-3">
        {agentPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agentPhotoUrl}
            alt={agentName ?? "Agent"}
            className="h-12 w-12 rounded-full border-2 border-white object-cover shadow-md"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
            {(agentName?.[0] ?? "A").toUpperCase()}
          </div>
        )}
        <div>
          <div className="text-sm font-semibold text-slate-900">
            — {agentName ?? t("pages.postcardScene.yourAgent")}
          </div>
          {brandName ? (
            <div className="text-xs text-slate-500">{brandName}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Birthday: confetti burst ──────────────────────────────────────

function BirthdayScene(props: SceneProps) {
  const { t } = useTranslation("dashboard");
  // Generate stable per-render confetti positions.
  const confetti = Array.from({ length: 60 }).map((_, i) => {
    const left = (i * 37) % 100;
    const delay = (i * 41) % 1200;
    const duration = 1800 + ((i * 97) % 1400);
    const colors = ["#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"];
    const color = colors[i % colors.length];
    return { left, delay, duration, color, key: i };
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-pink-50 via-white to-amber-50 pb-16 pt-10">
      <style>{`
        @keyframes pc-confetti-fall {
          0%   { transform: translateY(-20vh) rotate(0deg);  opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.4; }
        }
        @keyframes pc-title-pop {
          0%   { transform: scale(0.6); opacity: 0; }
          70%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {confetti.map((c) => (
          <span
            key={c.key}
            className="absolute h-2 w-2 rounded-sm"
            style={{
              left: `${c.left}%`,
              top: "-2vh",
              backgroundColor: c.color,
              animation: `pc-confetti-fall ${c.duration}ms ease-in ${c.delay}ms forwards`,
            }}
          />
        ))}
      </div>
      <div className="relative mx-auto max-w-xl px-4 text-center">
        <div className="text-6xl" aria-hidden>
          🎂
        </div>
        <h1
          className="mt-3 text-4xl font-extrabold tracking-tight text-pink-700 md:text-5xl"
          style={{ animation: "pc-title-pop 800ms ease-out 100ms both" }}
        >{t("pages.postcardAnimations.happyBirthday")}<br />
          {props.recipientName || "friend"}!
        </h1>
      </div>
      <MessageBlock {...props} />
    </div>
  );
}

// ── Anniversary: house reveal ────────────────────────────────────

function AnniversaryScene(props: SceneProps) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-50 via-white to-emerald-50 pb-16 pt-10">
      <style>{`
        @keyframes pc-house-rise {
          0%   { transform: translateY(40px); opacity: 0; }
          100% { transform: translateY(0);    opacity: 1; }
        }
        @keyframes pc-sun-pulse {
          0%, 100% { transform: scale(1);   opacity: 0.8; }
          50%      { transform: scale(1.1); opacity: 1; }
        }
        @keyframes pc-title-slide {
          0%   { transform: translateX(-20px); opacity: 0; }
          100% { transform: translateX(0);     opacity: 1; }
        }
      `}</style>
      <div className="relative mx-auto max-w-xl px-4 text-center">
        <div
          aria-hidden
          className="mx-auto mb-2 inline-block text-5xl"
          style={{ animation: "pc-sun-pulse 3s ease-in-out infinite" }}
        >
          ☀️
        </div>
        <div
          aria-hidden
          className="text-7xl"
          style={{ animation: "pc-house-rise 900ms ease-out 200ms both" }}
        >
          🏡
        </div>
        <h1
          className="mt-4 text-3xl font-bold tracking-tight text-sky-700 md:text-4xl"
          style={{ animation: "pc-title-slide 700ms ease-out 900ms both" }}
        >{t("pages.postcardAnimations.anotherYear")}<br />
          <span className="text-emerald-700">{props.recipientName || "friend"}</span>
        </h1>
        <p
          className="mt-3 text-base text-slate-600"
          style={{ animation: "pc-title-slide 700ms ease-out 1100ms both" }}
        >
          {t("pages.postcardAnimations.anniversaryCongrats")}
        </p>
      </div>
      <MessageBlock {...props} delayMs={1500} />
    </div>
  );
}

// ── Holiday seasonal (snow in winter, leaves in fall, else generic) ──

function HolidayScene(props: SceneProps) {
  const { t } = useTranslation("dashboard");
  const month = new Date().getMonth();
  // Dec-Feb → snow, Sep-Nov → leaves, else → warm glow
  const season: "snow" | "leaves" | "glow" =
    month === 11 || month <= 1
      ? "snow"
      : month >= 8 && month <= 10
        ? "leaves"
        : "glow";

  const items = Array.from({ length: 40 }).map((_, i) => {
    const left = (i * 53) % 100;
    const delay = (i * 71) % 3000;
    const duration = 4500 + ((i * 131) % 3500);
    return { left, delay, duration, key: i };
  });

  const symbol = season === "snow" ? "❄" : season === "leaves" ? "🍂" : "✨";
  const color =
    season === "snow" ? "#dbeafe" : season === "leaves" ? "#f97316" : "#fbbf24";
  const bg =
    season === "snow"
      ? "from-slate-100 via-white to-blue-50"
      : season === "leaves"
        ? "from-orange-50 via-white to-amber-50"
        : "from-amber-50 via-white to-yellow-50";

  return (
    <div className={`relative min-h-screen overflow-hidden bg-gradient-to-b ${bg} pb-16 pt-10`}>
      <style>{`
        @keyframes pc-drift {
          0%   { transform: translateY(-10vh) translateX(0)   rotate(0); opacity: 0; }
          15%  { opacity: 0.9; }
          100% { transform: translateY(110vh) translateX(40px) rotate(360deg); opacity: 0.2; }
        }
        @keyframes pc-fade-in-down {
          0%   { transform: translateY(-8px); opacity: 0; }
          100% { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {items.map((it) => (
          <span
            key={it.key}
            className="absolute select-none text-2xl"
            style={{
              left: `${it.left}%`,
              top: "-5vh",
              color,
              animation: `pc-drift ${it.duration}ms linear ${it.delay}ms infinite`,
            }}
          >
            {symbol}
          </span>
        ))}
      </div>
      <div className="relative mx-auto max-w-xl px-4 text-center">
        <h1
          className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl"
          style={{ animation: "pc-fade-in-down 900ms ease-out both" }}
        >{t("pages.dashFragments.warmWishesTo", { name: props.recipientName || t("pages.dashFragments.friend") })}
        </h1>
        <p
          className="mt-2 text-slate-600"
          style={{ animation: "pc-fade-in-down 900ms ease-out 400ms both" }}
        >
          {season === "snow"
            ? t("pages.index.wishingYouABright")
            : season === "leaves"
              ? t("pages.index.hopeAutumnTreatsYou")
              : t("pages.index.aLittleSunshineFor")}
        </p>
      </div>
      <MessageBlock {...props} delayMs={1000} />
    </div>
  );
}

// ── Thinking of you: subtle warm gradient ────────────────────────

function ThinkingScene(props: SceneProps) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-violet-100 via-white to-rose-50 pb-16 pt-10">
      <style>{`
        @keyframes pc-orb-float-a {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(20px, -15px); }
        }
        @keyframes pc-orb-float-b {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(-25px, 18px); }
        }
        @keyframes pc-heart-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.15); }
        }
        @keyframes pc-title-rise {
          0%   { transform: translateY(14px); opacity: 0; }
          100% { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-[12%] top-[20%] h-40 w-40 rounded-full bg-violet-200 blur-3xl"
          style={{ animation: "pc-orb-float-a 8s ease-in-out infinite" }}
        />
        <div
          className="absolute right-[10%] top-[40%] h-48 w-48 rounded-full bg-rose-200 blur-3xl"
          style={{ animation: "pc-orb-float-b 9s ease-in-out infinite" }}
        />
      </div>
      <div className="relative mx-auto max-w-xl px-4 text-center">
        <div
          aria-hidden
          className="text-6xl"
          style={{ animation: "pc-heart-pulse 2.4s ease-in-out infinite" }}
        >
          💌
        </div>
        <h1
          className="mt-3 text-3xl font-bold tracking-tight text-violet-900 md:text-4xl"
          style={{ animation: "pc-title-rise 800ms ease-out 200ms both" }}
        >{t("pages.postcardAnimations.thinkingOfYou")}<br />
          <span className="text-rose-700">{props.recipientName || "friend"}</span>
        </h1>
      </div>
      <MessageBlock {...props} delayMs={1100} />
    </div>
  );
}
