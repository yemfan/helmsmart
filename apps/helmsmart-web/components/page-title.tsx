import { term } from "@/lib/packs";
import { getServerT } from "@/lib/i18n/server";

/**
 * A page <h1> whose text is relabeled by the active industry pack, so headings match
 * the (already pack-aware) sidebar — e.g. "Books" renders as "Billing" on DoctorSmart,
 * "Reception" as "Front Desk". On Core it's the identity. Async server component.
 *
 * The pack decides WHICH label; the `nav` bundle decides what that label reads as in
 * the owner's language — the same keys the sidebar itself resolves, so a heading and
 * the nav item that leads to it can never disagree. A pack label with no key of its
 * own falls back to itself rather than rendering a raw key.
 */
export async function PageTitle({ base, className }: { base: string; className?: string }) {
  const label = await term(base);
  const t = await getServerT("nav");
  return (
    <h1 className={className ?? "text-2xl font-semibold text-slate-900"}>
      {t(label, { defaultValue: label })}
    </h1>
  );
}
