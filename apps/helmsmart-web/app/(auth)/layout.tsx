import type React from "react";
import { LogoMark } from "@helm/ui";
import { getActivePack } from "@/lib/packs";
import { getServerT } from "@/lib/i18n/server";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pack-aware brand: DoctorSmart on doctor.*/medical.*, HelmSmart elsewhere.
  const [pack, t] = await Promise.all([getActivePack(), getServerT("site")]);
  const baseName = pack.productName.replace(/(\s+AI|\.ai)$/i, "");

  // The manifest's `tagline` is an English literal, so login, signup, forgot- and
  // reset-password all showed "More control, less effort" above a fully Chinese
  // form — the whole front door, in the wrong language. No guard could see it: a
  // value read off a TS constant is neither a missing key nor a string literal in
  // JSX. `defaultValue` keeps a pack with no bundle on its own English rather than
  // printing a key path.
  const tagline = pack.taglineKey
    ? t(pack.taglineKey, { defaultValue: pack.tagline ?? "" })
    : pack.tagline;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark — driven by the active pack manifest */}
        <div className="mb-8 text-center flex flex-col items-center gap-3">
          <LogoMark letter={pack.logoLetter} size={48} />
          <div>
            <span className="text-2xl font-bold text-slate-900 tracking-tight">
              {baseName}<span style={{ color: "var(--brand)" }}>.ai</span>
            </span>
            {tagline && (
              <p className="mt-1 text-sm text-slate-500">{tagline}</p>
            )}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
