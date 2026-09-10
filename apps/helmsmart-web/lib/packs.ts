import { headers } from "next/headers";
import type { PackManifest } from "@helm/ui";
import { medicalManifest } from "@helm/pack-medical";
import { packIdForHost, connForHost, type PackConn } from "@/lib/pack-host";

/**
 * Active industry-pack resolution (Slice 1).
 *
 * The vertical is a CONFIGURATION dimension, not a route — it's resolved from the
 * request host (subdomain) and applied to the SAME industry-agnostic Core routes.
 *   medical.helmsmart.ai  (or  medical.localhost  in dev)  -> DoctorSmart AI
 *   every other host                                        -> HelmSmart
 * So nothing changes for HelmSmart until the medical subdomain exists — safe to
 * ship before DNS. (Middleware resolution + a `?pack=` override move to Slice 2,
 * when the middleware also routes auth to the per-vertical Supabase.)
 */
const helmManifest: PackManifest = {
  id: "helm",
  productName: "HelmSmart",
  logoLetter: "H",
  dataPack: "helm",
  auth: "shared",
  terms: {},
  // `tagline` is the fallback; `taglineKey` is what actually renders, so the
  // auth pages stop showing English under a Chinese form. Both say the same
  // thing in English — keep them in step.
  tagline: "More control, less effort",
  taglineKey: "footer.tagline",
};

const PACKS: Record<string, PackManifest> = {
  helm: helmManifest,
  medical: medicalManifest,
};

/** Resolve the active pack manifest from the request host. Defaults to HelmSmart. */
export async function getActivePack(): Promise<PackManifest> {
  const host = (await headers()).get("host") ?? "";
  return PACKS[packIdForHost(host)] ?? helmManifest;
}

/**
 * Relabel a Core noun for the active pack — the same map the sidebar uses, so page
 * headings stay in lockstep with the nav (e.g. "Reception" → "Front Desk", "Books"
 * → "Billing" on medical). Identity on Core, where `terms` is empty.
 */
export async function term(label: string): Promise<string> {
  return (await getActivePack()).terms?.[label] ?? label;
}

/** Server-side Supabase connection override for the active pack (undefined = Core). */
export async function getActivePackSupabase(): Promise<PackConn | undefined> {
  return connForHost((await headers()).get("host") ?? "");
}

/**
 * Service-role connection for the medical pack — SERVER-ONLY secret
 * (MEDICAL_SUPABASE_SERVICE_ROLE_KEY, set in Vercel env, never inlined). Returns
 * undefined when the key isn't configured, so callers gracefully fall back to Core.
 */
function medicalServiceConn(): PackConn | undefined {
  const url = process.env.NEXT_PUBLIC_MEDICAL_SUPABASE_URL;
  const key = process.env.MEDICAL_SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : undefined;
}

/** Host-resolved SERVICE (RLS-bypass) connection for the active pack (undefined = Core). */
export async function getActivePackServiceConn(): Promise<PackConn | undefined> {
  try {
    const host = (await headers()).get("host") ?? "";
    return packIdForHost(host) === "medical" ? medicalServiceConn() : undefined;
  } catch {
    return undefined; // called outside a request scope -> Core
  }
}

/**
 * Every configured pack SERVICE connection — Core plus any vertical whose service
 * key is set. Cron / cross-pack jobs have no request host, so they loop over these
 * to process every vertical's orgs. `undefined` = Core.
 */
export function packServiceConns(): Array<PackConn | undefined> {
  const conns: Array<PackConn | undefined> = [undefined]; // Core
  const medical = medicalServiceConn();
  if (medical) conns.push(medical);
  return conns;
}
