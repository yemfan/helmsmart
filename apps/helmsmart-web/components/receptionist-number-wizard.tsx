"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Link2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { provisionNumber, importExistingNumber } from "@/lib/actions/voice-setup";

type Tab = "buy" | "import";

export function ReceptionistNumberWizard() {
  const { t } = useTranslation("voice");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("buy");
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // buy
  const [areaCode, setAreaCode] = useState("");
  const [tollFree, setTollFree] = useState(false);
  // import
  const [number, setNumber] = useState("");
  const [terminationUri, setTerminationUri] = useState("");
  const [sipUser, setSipUser] = useState("");
  const [sipPass, setSipPass] = useState("");

  function run(fn: () => Promise<{ ok: boolean; number?: string; error?: string }>) {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? t("wizard.genericError"));
        return;
      }
      setDone(res.number ?? "");
      router.refresh(); // re-render the server checklist → flips to “connected”
    });
  }

  if (done) {
    return (
      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 mb-5 flex items-start gap-2.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-emerald-800">{t("wizard.connectedTitle", { number: done })}</p>
          <p className="text-xs text-emerald-700 mt-0.5">
            {t("wizard.connectedBody")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 mb-5">
      <div className="flex items-center gap-1 mb-3">
        <TabButton active={tab === "buy"} onClick={() => { setTab("buy"); setError(null); }} icon={<ShoppingCart className="w-3.5 h-3.5" />}>
          {t("wizard.buyTab")}
        </TabButton>
        <TabButton active={tab === "import"} onClick={() => { setTab("import"); setError(null); }} icon={<Link2 className="w-3.5 h-3.5" />}>
          {t("wizard.importTab")}
        </TabButton>
      </div>

      {tab === "buy" ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {t("wizard.buyHint")}
          </p>
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="block text-xs font-medium text-slate-500 mb-1">{t("wizard.areaCode")}</span>
              <input
                value={areaCode}
                onChange={(e) => { setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3)); setError(null); }}
                inputMode="numeric"
                placeholder="626"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-3 text-xs text-slate-600">
              <input type="checkbox" checked={tollFree} onChange={(e) => setTollFree(e.target.checked)} className="rounded border-slate-300" />
              {t("wizard.tollFree")}
            </label>
          </div>
          <button
            onClick={() => run(() => provisionNumber({ areaCode, tollFree }))}
            disabled={isPending || areaCode.length !== 3}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            {isPending ? t("wizard.gettingNumber") : t("wizard.getNumber")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {t("wizard.importHint")}
          </p>
          <Field label={t("wizard.phoneNumber")} value={number} onChange={setNumber} placeholder="+16265551234" />
          <Field label={t("wizard.terminationUri")} value={terminationUri} onChange={setTerminationUri} placeholder="yourtrunk.pstn.twilio.com" />
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("wizard.sipUser")} value={sipUser} onChange={setSipUser} placeholder="" />
            <Field label={t("wizard.sipPass")} value={sipPass} onChange={setSipPass} placeholder="" type="password" />
          </div>
          <button
            onClick={() => run(() => importExistingNumber({ phoneNumber: number, terminationUri, sipUser, sipPass }))}
            disabled={isPending || !number || !terminationUri}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {isPending ? t("wizard.connecting") : t("wizard.connectNumber")}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 text-xs text-rose-600" role="alert">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        active ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
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
    </label>
  );
}
