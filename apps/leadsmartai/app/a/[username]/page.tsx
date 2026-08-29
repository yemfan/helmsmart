import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { displayUsername } from "@/lib/identity/username";
import { loadHubByUsername, type Hub } from "@/lib/marketing-hub/loadHub";
import { postedAgo } from "@/lib/marketing-hub/feedItems";
import HubLeadForm from "./HubLeadForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The agent's public marketing hub — PUBLIC, unauthenticated.
 *
 * Reached as closebossai.com/@michaelye (a rewrite in next.config points the
 * pretty URL here; the App Router reserves a leading "@" for parallel-route
 * slots, so this cannot live at app/@[username]).
 *
 * It is a feed, not a brochure. The agent's published posts are what make the
 * page worth a second visit and worth indexing — a hub with fifty real posts
 * is not the thin, near-identical doorway page that gets a domain penalised.
 *
 * Three states:
 *   ready        published, renders in full
 *   coming_soon  the handle is claimed but the hub is not published. Resolves
 *                so the agent can share the link while they finish, and holds
 *                their claim on the URL. Never indexed.
 *   not_found    no such handle, or the agent is deleted
 *
 * Even a ready hub is noindex until it clears a content bar (see isIndexable):
 * a penalty earned by a hundred empty hubs would drag the whole domain down,
 * and that risk is shared with the ~3,100 city pages already ranking.
 */

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function canonicalFor(username: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.closebossai.com").replace(
    /\/+$/,
    "",
  );
  return `${base}/@${username}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getServerT();
  const { username } = await params;
  const hub = await loadHubByUsername(username);

  if (hub.status === "not_found") {
    return {
      title: t("hub.notFoundTitle", { ns: "web_marketing" }),
      robots: { index: false, follow: false },
    };
  }

  const name = hub.agent?.name?.trim() || hub.brandName || displayUsername(hub.username);

  if (hub.status === "coming_soon") {
    return {
      title: `${name} — ${t("hub.comingSoonTitle", { ns: "web_marketing" })}`,
      robots: { index: false, follow: false },
    };
  }

  const description =
    (hub.bio ?? "").slice(0, 155) ||
    [name, hub.brandName, hub.serviceAreas[0]].filter(Boolean).join(" · ");

  return {
    title: hub.brandName ? `${name} · ${hub.brandName}` : name,
    description,
    // A parent generateMetadata MERGES rather than resets, so the canonical is
    // set explicitly here — inheriting it once made every guide page claim to
    // be the homepage.
    alternates: { canonical: canonicalFor(hub.username) },
    robots: hub.indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      title: name,
      description,
      url: canonicalFor(hub.username),
      images: hub.portraitUrl ? [{ url: hub.portraitUrl }] : undefined,
    },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-3xl px-5 py-16">{children}</div>
    </main>
  );
}

export default async function AgentHubPage({ params, searchParams }: Props) {
  const t = await getServerT();
  const { username } = await params;
  const query = await searchParams;
  const hub: Hub = await loadHubByUsername(username);

  if (hub.status === "not_found") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">
          {t("hub.notFoundTitle", { ns: "web_marketing" })}
        </h1>
        <p className="mt-3 text-slate-600">
          {t("hub.notFoundBody", { ns: "web_marketing" })}
        </p>
      </Shell>
    );
  }

  const displayName =
    hub.agent?.name?.trim() || hub.brandName || displayUsername(hub.username);

  if (hub.status === "coming_soon") {
    return (
      <Shell>
        <p className="text-sm uppercase tracking-widest text-slate-500">
          {displayUsername(hub.username)}
        </p>
        <h1 className="mt-3 text-3xl font-semibold">
          {t("hub.comingSoonTitle", { ns: "web_marketing" })}
        </h1>
        <p className="mt-3 text-slate-600">
          {t("hub.comingSoonBody", { ns: "web_marketing" })}
        </p>
      </Shell>
    );
  }

  const utm = {
    source: typeof query.utm_source === "string" ? query.utm_source : null,
    campaign: typeof query.utm_campaign === "string" ? query.utm_campaign : null,
  };

  return (
    <Shell>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {hub.portraitUrl ? (
          <Image
            src={hub.portraitUrl}
            alt={displayName}
            width={112}
            height={112}
            className="h-28 w-28 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
            unoptimized
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">{displayName}</h1>
          {hub.brandName && hub.brandName !== displayName ? (
            <p className="mt-1 text-slate-600">{hub.brandName}</p>
          ) : null}
          {hub.serviceAreas.length ? (
            <p className="mt-1 text-sm text-slate-500">
              {t("hub.servingAreas", { ns: "web_marketing" })}{" "}
              {hub.serviceAreas.join(" · ")}
            </p>
          ) : null}
        </div>
      </header>

      {hub.bio ? (
        <p className="mt-8 max-w-prose whitespace-pre-line leading-relaxed text-slate-700">
          {hub.bio}
        </p>
      ) : null}

      {hub.specialties.length ? (
        <ul className="mt-5 flex flex-wrap gap-2">
          {hub.specialties.map((s) => (
            <li
              key={s}
              className="rounded-full bg-white px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200"
            >
              {s}
            </li>
          ))}
        </ul>
      ) : null}

      <nav className="mt-9 flex flex-wrap gap-3">
        <Link
          href={`/home-value?agent=${hub.username}`}
          className="rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-800"
        >
          {t("hub.ctaHomeValue", { ns: "web_marketing" })}
        </Link>
        <Link
          href={`/homes?agent=${hub.username}`}
          className="rounded-lg bg-white px-4 py-2.5 font-medium text-slate-900 ring-1 ring-slate-300 hover:bg-slate-100"
        >
          {t("hub.ctaFindHome", { ns: "web_marketing" })}
        </Link>
        {hub.agent?.phone ? (
          <a
            href={`tel:${hub.agent.phone.replace(/[^\d+]/g, "")}`}
            className="rounded-lg bg-white px-4 py-2.5 font-medium text-slate-900 ring-1 ring-slate-300 hover:bg-slate-100"
          >
            {t("hub.ctaTalk", { ns: "web_marketing" })}
          </a>
        ) : null}
      </nav>

      <section className="mt-14">
        <h2 className="text-xl font-semibold">
          {t("hub.feedTitle", { ns: "web_marketing" })}
        </h2>
        {hub.feed.length === 0 ? (
          <p className="mt-3 text-slate-500">
            {t("hub.feedEmpty", { ns: "web_marketing" })}
          </p>
        ) : (
          <ul className="mt-5 grid gap-5 sm:grid-cols-2">
            {hub.feed.map((item) => (
              <li
                key={item.id}
                className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200"
              >
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt=""
                    width={640}
                    height={640}
                    className="aspect-square w-full object-cover"
                    unoptimized
                  />
                ) : null}
                <div className="p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    {[item.platform, postedAgo(item.postedAt)].filter(Boolean).join(" · ")}
                  </p>
                  {item.caption ? (
                    <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-slate-700">
                      {item.caption}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-14">
        <HubLeadForm
          username={hub.username}
          utmSource={utm.source}
          utmCampaign={utm.campaign}
          labels={{
            title: t("hub.formTitle", { ns: "web_marketing" }),
            blurb: t("hub.formBlurb", { ns: "web_marketing" }),
            name: t("hub.fieldName", { ns: "web_marketing" }),
            email: t("hub.fieldEmail", { ns: "web_marketing" }),
            phone: t("hub.fieldPhone", { ns: "web_marketing" }),
            message: t("hub.fieldMessage", { ns: "web_marketing" }),
            consent: t("hub.consentLabel", { ns: "web_marketing" }),
            submit: t("hub.submit", { ns: "web_marketing" }),
            submitting: t("hub.submitting", { ns: "web_marketing" }),
            thanksTitle: t("hub.thanksTitle", { ns: "web_marketing" }),
            thanksBody: t("hub.thanksBody", { ns: "web_marketing" }),
            errorGeneric: t("hub.errorGeneric", { ns: "web_marketing" }),
            errorName: t("hub.errorName", { ns: "web_marketing" }),
            errorContact: t("hub.errorContact", { ns: "web_marketing" }),
          }}
        />
      </section>

      <footer className="mt-16 border-t border-slate-200 pt-6 text-sm text-slate-500">
        <p>
          {[
            hub.agent?.brokerage,
            hub.agent?.licenseNumber
              ? `${t("hub.licenseLabel", { ns: "web_marketing" })} ${hub.agent.licenseNumber}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-2">{t("hub.poweredBy", { ns: "web_marketing" })}</p>
      </footer>
    </Shell>
  );
}
