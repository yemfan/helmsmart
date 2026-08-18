"use client";

import { PICKABLE_AVATARS, avatarUrl } from "@/lib/closeboss/avatars";
import { useTranslation } from "react-i18next";

/** A single circular avatar — a custom uploaded photo (`url`) when present,
 *  otherwise the built-in persona for `id`. */
export function AssistantAvatar({
  id,
  url,
  size = 40,
  alt = "",
  className,
}: {
  id: string;
  url?: string | null;
  size?: number;
  alt?: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url || avatarUrl(id)}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "block",
        objectFit: "cover",
        background: "#f1f5f9",
        flexShrink: 0,
      }}
    />
  );
}

/** A grid of every pickable avatar (mascots first, then illustrated); highlights the selected one. */
export function AssistantAvatarPicker({
  value,
  onSelect,
  size = 48,
  disabled,
}: {
  value?: string;
  onSelect: (id: string) => void;
  size?: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div
      role="radiogroup"
      aria-label={t("pages.misc.chooseAvatar")}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(5, ${size}px)` }}
    >
      {PICKABLE_AVATARS.map((id) => {
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onSelect(id)}
            title={id}
            className={`rounded-full p-0.5 transition disabled:cursor-default disabled:opacity-60 ${
              selected ? "ring-2 ring-[#0072ce] ring-offset-1" : "ring-2 ring-transparent hover:ring-gray-200"
            }`}
            style={{ lineHeight: 0, background: "transparent" }}
          >
            <AssistantAvatar id={id} size={size} />
          </button>
        );
      })}
    </div>
  );
}
