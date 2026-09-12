import Link from "next/link";
import { Check } from "lucide-react";

import { activationState, type ActivationStepId } from "@/lib/activation";
import { loadActivationFacts } from "@/lib/activation-facts";
import { getServerT } from "@/lib/i18n/server";

/**
 * What is still between this owner and a call Emma answers, at the top of
 * /home until there is nothing left.
 *
 * It is derived, not stored: `loadActivationFacts` reads the same rows the
 * guided setup writes and `activationState` decides what they mean, so the
 * list is right without anything having to remember to update it — a number
 * added in Settings ticks the number line, and the card disappears on its own
 * the moment a first call lands.
 *
 * Body text and a tick, in the page's own colours. Reading a checklist is not
 * an emergency, and the KPI cards below are what the page exists to show.
 * Renders nothing when it cannot read (a dashboard must not die for a
 * checklist), and nothing when the work is done.
 */
export async function ActivationChecklist({ orgId }: { orgId: string }) {
  if (!orgId) return null;

  let state: ReturnType<typeof activationState>;
  try {
    const read = await loadActivationFacts(orgId);
    if (!read) return null;
    state = activationState(read.facts);
  } catch (e) {
    console.error("[activation-checklist] could not read setup state", e);
    return null;
  }
  if (state.complete) return null;

  const t = await getServerT("home");

  return (
    <section aria-labelledby="activation-heading" className="mt-5 max-w-2xl">
      <h2 id="activation-heading" className="text-sm font-semibold text-slate-800">
        {t("activation.title")}
      </h2>
      <p className="mt-0.5 text-sm text-slate-500">
        {t("activation.progress", { done: state.done, total: state.total })}
      </p>
      <ul className="mt-2 space-y-1.5">
        {state.steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2 text-sm">
            {step.done ? (
              <Check className="mt-[3px] h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
            ) : (
              <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-300" />
            )}
            {step.done ? (
              <span className="text-slate-400 line-through decoration-slate-200">
                {t(`activation.steps.${step.id}` as `activation.steps.${ActivationStepId}`)}
              </span>
            ) : (
              <Link href={`/setup?step=${step.id}`} className="text-slate-600 underline-offset-2 hover:underline">
                {t(`activation.steps.${step.id}` as `activation.steps.${ActivationStepId}`)}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {state.next && (
        <Link
          href={`/setup?step=${state.next}`}
          className="mt-2.5 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {t("activation.continue")}
        </Link>
      )}
    </section>
  );
}
