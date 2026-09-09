"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { seedWorkforce } from "@/lib/actions/workforce";

export function SeedWorkforceButton() {
  const { t } = useTranslation("home");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              await seedWorkforce();
              router.refresh();
            } catch (e) {
              console.error("seed workforce", e);
              setError(t("commandCenter.seed.error"));
            }
          })
        }
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        {pending ? t("commandCenter.seed.pending") : t("commandCenter.seed.cta")}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
