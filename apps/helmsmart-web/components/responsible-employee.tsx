import { getWorkforce } from "@/lib/actions/workforce";
import { getBlueprint } from "@helm/ai-workforce";
import { Avatar, defaultAvatarForSeed } from "@helm/ui";
import { getServerT } from "@/lib/i18n/server";

/**
 * A small "handled by {employee}" chip naming the AI employee responsible for this
 * page's department — one DNA module → one employee (e.g. Front Desk → Emma). Shows
 * the employee's chosen avatar, falling back to the role-fit default, then a stable
 * hash. Self-fetching async server component; renders nothing if the slug is unknown.
 */
export async function ResponsibleEmployee({ slug, className }: { slug: string; className?: string }) {
  const t = await getServerT("tasks");
  const tc = await getServerT("common");
  const blueprint = getBlueprint(slug);
  let name = blueprint?.name;
  let role = blueprint?.role;
  let chosen: string | null | undefined;
  try {
    const employee = (await getWorkforce()).find((e) => e.slug === slug);
    if (employee) {
      name = employee.name;
      role = employee.role;
      chosen = employee.avatar;
    }
  } catch {
    // Outside an org scope (e.g. not authenticated) — fall back to the static blueprint.
  }
  if (!name || !role) return null;
  // Chosen avatar → the role-fit default from the blueprint → a stable hash: exactly the
  // resolution the Command Center uses, so the badge and the workforce board never disagree.
  const avatar = chosen ?? blueprint?.avatar ?? defaultAvatarForSeed(slug);

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 shadow-sm ${className ?? ""}`}
    >
      <Avatar id={avatar} size={22} alt={name} />
      <span className="text-xs text-slate-600">
        <span className="text-slate-400">{t("responsibleEmployee.handledBy")}</span>{" "}
        <span className="font-medium text-slate-700">{name}</span>
        {/* The NAME is a proper noun and stays; the ROLE is a job title and
            translates. Keyed by the English title, like the nav, so a role
            added to the roster (or renamed in the database) renders itself
            rather than a raw key. */}
        <span className="text-slate-400"> · {tc(`aiRoles.${role}`, { defaultValue: role })}</span>
      </span>
    </div>
  );
}
