"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronDown,
  Link2,
  Loader2,
  PhoneForwarded,
  ShoppingCart,
  SquarePen,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NumberWiringStatus } from "@/components/number-wiring-status";
import { ReceptionistNumberSimple } from "@/components/receptionist-number-simple";
import { saveTwilioNumber } from "@/lib/actions/messages";
import { importExistingNumber, provisionNumber } from "@/lib/actions/voice-setup";
import type { WiringResult } from "@/lib/voice/number-wiring";

/**
 * Getting a number that actually answers — the one flow, in the one place.
 *
 * What this replaces: a single text box that wrote `organizations.twilio_number`
 * and nothing else. No number was bought, nothing was attached to the agent,
 * no inbound webhook was pointed here — so an owner typed a number, the screen
 * looked configured, and every call to it went nowhere. The code that DOES wire
 * a number had been sitting in the repo unimported.
 *
 * Four honest paths, in the order most owners want them:
 *
 *  1. Get a number from HelmSmart — buys it and wires it in one step, so it
 *     answers immediately. Spends the owner's money, and says so first.
 *  2. Keep your current business number — the real mechanism, which is call
 *     forwarding AT THEIR CARRIER onto a HelmSmart number. HelmSmart does not
 *     forward calls and this copy must never suggest it does: there is no
 *     column, no Retell transfer and no Twilio <Dial> behind such a claim.
 *  3. Advanced — import a Twilio number they already own, over its SIP trunk.
 *  4. The escape hatch — record a number that already reaches us (orgs sharing
 *     one line). Honest because the save is followed by a real check.
 */

type Path = "buy" | "forward" | "import" | "manual";

export function ReceptionistNumberSetup({
  current,
  canManage = true,
  manualHref,
  onWiring,
}: {
  /** The org's number as stored, or null. */
  current: string | null;
  /** Owner/admin. The server action enforces this too — this only avoids offering it. */
  canManage?: boolean;
  /** Where the by-hand provider instructions live, for numbers we cannot repair. */
  manualHref?: string;
  /** Reports the provider's answer up, so a parent badge says the same thing. */
  onWiring?: (result: WiringResult | null) => void;
}) {
  const { t } = useTranslation("voice");
  const router = useRouter();
  const [open, setOpen] = useState<Path | null>(current ? null : "buy");
  const [acquired, setAcquired] = useState<string | null>(null);

  const number = acquired ?? current;

  // A number is already recorded: lead with whether it works, and keep the
  // paths available behind a disclosure so it can still be changed.
  if (number) {
    return (
      <section className="border border-slate-200 rounded-lg p-4 mb-5 space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">{t("numberSetup.yourNumber")}</h4>
          <p className="text-sm text-slate-600 mt-0.5 font-mono">{number}</p>
        </div>

        <NumberWiringStatus number={number} manualHref={manualHref} onResult={onWiring} />

        <ChangeNumber current={number} canManage={canManage} />
      </section>
    );
  }

  return (
    <section className="border border-slate-200 rounded-lg p-4 mb-5">
      <h4 className="text-sm font-semibold text-slate-800">{t("numberSetup.title")}</h4>
      <p className="text-xs text-slate-500 mt-0.5 mb-3">{t("numberSetup.description")}</p>

      <div className="divide-y divide-slate-100 border-t border-slate-100">
        <Option
          id="buy"
          open={open === "buy"}
          onToggle={setOpen}
          icon={<ShoppingCart className="w-4 h-4 text-indigo-500" />}
          title={t("numberSetup.buy.title")}
          subtitle={t("numberSetup.buy.subtitle")}
          recommended={t("numberSetup.recommended")}
        >
          <BuyPath canManage={canManage} onDone={(n) => { setAcquired(n); router.refresh(); }} />
        </Option>

        <Option
          id="forward"
          open={open === "forward"}
          onToggle={setOpen}
          icon={<PhoneForwarded className="w-4 h-4 text-indigo-500" />}
          title={t("numberSetup.forward.title")}
          subtitle={t("numberSetup.forward.subtitle")}
        >
          <ForwardPath onGetNumber={() => setOpen("buy")} />
        </Option>

        <Option
          id="import"
          open={open === "import"}
          onToggle={setOpen}
          icon={<Link2 className="w-4 h-4 text-slate-400" />}
          title={t("numberSetup.import.title")}
          subtitle={t("numberSetup.import.subtitle")}
        >
          <ImportPath canManage={canManage} onDone={(n) => { setAcquired(n); router.refresh(); }} />
        </Option>

        <Option
          id="manual"
          open={open === "manual"}
          onToggle={setOpen}
          icon={<SquarePen className="w-4 h-4 text-slate-400" />}
          title={t("numberSetup.manual.title")}
          subtitle={t("numberSetup.manual.subtitle")}
        >
          {/*
            Typing a number records it and nothing else — so the component that
            does it checks afterwards and says what it found. Kept because some
            accounts genuinely share one line that is already wired.
          */}
          <ReceptionistNumberSimple current={null} frameless />
        </Option>
      </div>
    </section>
  );
}

/* ─── Path 1: buy ─────────────────────────────────────────────────────────── */

function BuyPath({ canManage, onDone }: { canManage: boolean; onDone: (n: string) => void }) {
  const { t } = useTranslation("voice");
  const [areaCode, setAreaCode] = useState("");
  const [tollFree, setTollFree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleBuy() {
    setError(null);
    start(async () => {
      const res = await provisionNumber({ areaCode, tollFree });
      if (!res.ok || !res.number) {
        setError(res.error ?? t("numberSetup.buy.failed"));
        return;
      }
      onDone(res.number);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">{t("numberSetup.buy.how")}</p>

      {/*
        The money sentence, above the button and in the owner's words. We do not
        know the carrier's price for a given number, so this says what is true —
        it is a purchase, billed every month — rather than quoting a figure the
        app cannot stand behind.
      */}
      <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        {t("numberSetup.buy.cost")}
      </p>

      {canManage ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">{t("numberSetup.buy.areaCode")}</span>
              <input
                value={areaCode}
                onChange={(e) => { setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3)); setError(null); }}
                inputMode="numeric"
                placeholder={tollFree ? "800" : "626"}
                className="w-28 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-3 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={tollFree}
                onChange={(e) => setTollFree(e.target.checked)}
                className="rounded border-slate-300"
              />
              {t("numberSetup.buy.tollFree")}
            </label>
          </div>
          <p className="text-xs text-slate-400">{t("numberSetup.buy.areaCodeHelp")}</p>

          {/*
            One unmistakable control, and it only ever runs from this click —
            never as a side effect of saving something else on the page.
          */}
          <button
            type="button"
            onClick={handleBuy}
            disabled={isPending || areaCode.length !== 3}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            {isPending ? t("numberSetup.buy.working") : t("numberSetup.buy.action")}
          </button>
        </>
      ) : (
        <p className="text-xs text-slate-500">{t("numberSetup.ownerOnly")}</p>
      )}

      {error ? (
        <p className="text-xs text-rose-600 flex items-start gap-1.5" role="alert">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/* ─── Path 2: forward your existing line, at your carrier ─────────────────── */

function ForwardPath({ onGetNumber }: { onGetNumber: () => void }) {
  const { t } = useTranslation("voice");
  return (
    <div className="space-y-2.5">
      {/*
        HelmSmart does not forward calls. There is no column for it, no Retell
        transfer and no Twilio <Dial> — so this describes the thing that does
        work, which the owner sets up at their own phone provider, and says
        plainly whose job it is.
      */}
      <p className="text-xs text-slate-600">{t("numberSetup.forward.how")}</p>
      <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside">
        <li>{t("numberSetup.forward.step1")}</li>
        <li>{t("numberSetup.forward.step2")}</li>
        <li>{t("numberSetup.forward.step3")}</li>
        <li>{t("numberSetup.forward.step4")}</li>
      </ol>
      <p className="text-xs text-slate-500">{t("numberSetup.forward.carrierNote")}</p>
      <button
        type="button"
        onClick={onGetNumber}
        className="text-xs font-medium text-indigo-600 hover:text-indigo-700 underline"
      >
        {t("numberSetup.forward.startHere")}
      </button>
    </div>
  );
}

/* ─── Path 3: import a Twilio number you own ──────────────────────────────── */

function ImportPath({ canManage, onDone }: { canManage: boolean; onDone: (n: string) => void }) {
  const { t } = useTranslation("voice");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [terminationUri, setTerminationUri] = useState("");
  const [sipUser, setSipUser] = useState("");
  const [sipPass, setSipPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleImport() {
    setError(null);
    start(async () => {
      const res = await importExistingNumber({ phoneNumber, terminationUri, sipUser, sipPass });
      if (!res.ok || !res.number) {
        setError(res.error ?? t("numberSetup.import.failed"));
        return;
      }
      onDone(res.number);
    });
  }

  if (!canManage) return <p className="text-xs text-slate-500">{t("numberSetup.ownerOnly")}</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">{t("numberSetup.import.how")}</p>
      <Field
        label={t("numberSetup.import.phoneNumber")}
        help={t("numberSetup.import.phoneNumberHelp")}
        value={phoneNumber}
        onChange={(v) => { setPhoneNumber(v); setError(null); }}
        placeholder="+16265551234"
      />
      <Field
        label={t("numberSetup.import.terminationUri")}
        help={t("numberSetup.import.terminationUriHelp")}
        value={terminationUri}
        onChange={(v) => { setTerminationUri(v); setError(null); }}
        placeholder="yourtrunk.pstn.twilio.com"
      />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={t("numberSetup.import.sipUser")} value={sipUser} onChange={setSipUser} placeholder="" />
        <Field label={t("numberSetup.import.sipPass")} value={sipPass} onChange={setSipPass} placeholder="" type="password" />
      </div>
      <p className="text-xs text-slate-400">{t("numberSetup.import.sipAuthHelp")}</p>

      <button
        type="button"
        onClick={handleImport}
        disabled={isPending || !phoneNumber.trim() || !terminationUri.trim()}
        className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        {isPending ? t("numberSetup.import.working") : t("numberSetup.import.action")}
      </button>

      {error ? (
        <p className="text-xs text-rose-600 flex items-start gap-1.5" role="alert">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/* ─── Changing a number that is already set ───────────────────────────────── */

function ChangeNumber({ current, canManage }: { current: string; canManage: boolean }) {
  const { t } = useTranslation("voice");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleRemove() {
    setError(null);
    start(async () => {
      const res = await saveTwilioNumber("");
      if (!res.ok) {
        setError(res.error ?? t("numberSetup.change.removeFailed"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <details className="group">
      <summary className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 cursor-pointer list-none">
        <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
        {t("numberSetup.change.summary")}
      </summary>
      <div className="mt-2.5 space-y-2">
        <p className="text-xs text-slate-600">{t("numberSetup.change.body", { number: current })}</p>
        {canManage ? (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="px-3 py-1.5 border border-slate-200 hover:border-slate-300 disabled:opacity-50 text-xs font-medium text-slate-700 rounded-lg transition-colors"
          >
            {isPending ? t("numberSetup.change.removing") : t("numberSetup.change.remove")}
          </button>
        ) : (
          <p className="text-xs text-slate-500">{t("numberSetup.ownerOnly")}</p>
        )}
        <p className="text-xs text-slate-400">{t("numberSetup.change.keepsNumber")}</p>
        {error ? (
          <p className="text-xs text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}

/* ─── Bits ────────────────────────────────────────────────────────────────── */

function Option({
  id,
  open,
  onToggle,
  icon,
  title,
  subtitle,
  recommended,
  children,
}: {
  id: Path;
  open: boolean;
  onToggle: (p: Path | null) => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  recommended?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2.5">
      <button
        type="button"
        onClick={() => onToggle(open ? null : id)}
        aria-expanded={open}
        className="w-full flex items-start gap-2.5 text-left"
      >
        <span className="mt-0.5 flex-shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{title}</span>
            {recommended ? (
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
                {recommended}
              </span>
            ) : null}
          </span>
          <span className="block text-xs text-slate-500 mt-0.5">{subtitle}</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="mt-3 pl-7">{children}</div> : null}
    </div>
  );
}

function Field({
  label,
  help,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {help ? <span className="block text-xs text-slate-400 mt-1">{help}</span> : null}
    </label>
  );
}
