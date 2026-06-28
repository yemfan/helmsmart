"use client";

import { AVATARS, avatarUrl } from "@/lib/realtorboss/avatars";

/** A single circular persona avatar. */
export function AssistantAvatar({
  id,
  size = 40,
  alt = "",
  className,
}: {
  id: string;
  size?: number;
  alt?: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl(id)}
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

/** A grid of all 20 avatars; highlights the selected one. */
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
  return (
    <div
      role="radiogroup"
      aria-label="Choose an avatar"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(5, ${size}px)` }}
    >
      {AVATARS.map((id) => {
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
