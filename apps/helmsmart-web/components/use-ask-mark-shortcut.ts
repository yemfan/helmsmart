"use client";

import { useEffect, useState } from "react";
import { askMarkShortcutLabel, isApplePlatform } from "@/lib/ask-mark";

/**
 * The Ask Mark shortcut as this reader types it — "⌘/" on a Mac, "Ctrl+/"
 * elsewhere. Starts as "Ctrl+/" so the server render and the first paint
 * agree, then settles once the platform is known.
 */
export function useAskMarkShortcutLabel(): string {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(isApplePlatform(typeof navigator === "undefined" ? undefined : navigator));
  }, []);
  return askMarkShortcutLabel(isMac);
}
