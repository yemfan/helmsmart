import { HelmLogo } from "@/components/logo";
import { getServerT } from "@/lib/i18n/server";

// Sibling businesses under MAXY Investment — cross-promoted in every footer.
// This app is HelmSmart, so it links to the other three. The label is the
// product's name in either language; only the blurb is copy.
const PARTNERS = [
  { key: "propertytools", label: "Property Tools AI", href: "https://www.propertytoolsai.com" },
  { key: "closeboss", label: "CloseBoss", href: "https://www.closebossai.com" },
  { key: "marketingboss", label: "MarketingBoss", href: "https://marketingbossai.com" },
];

// Group heading + link labels are keys into `site.footer`; hrefs are routes.
const footerLinks = [
  {
    group: "product",
    links: [
      { key: "features", href: "/features" },
      { key: "pricing", href: "/pricing" },
      { key: "scheduleDemo", href: "/contact/sales" },
      { key: "startFreeTrial", href: "/signup" },
    ],
  },
  {
    group: "company",
    links: [
      { key: "about", href: "/about" },
      { key: "blog", href: "/blog" },
      { key: "contact", href: "/contact" },
    ],
  },
  {
    group: "resources",
    links: [
      { key: "faq", href: "/faq" },
      { key: "signIn", href: "/login" },
      { key: "getStarted", href: "/signup" },
    ],
  },
  {
    group: "legal",
    links: [
      { key: "privacy", href: "/privacy" },
      { key: "terms", href: "/terms" },
    ],
  },
];

export async function MarketingFooter() {
  const t = await getServerT("site");

  return (
    <footer className="bg-slate-900 text-white">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {footerLinks.map(({ group, links }) => (
            <div key={group}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
                {t(`footer.groups.${group}`)}
              </h3>
              <ul className="mt-4 space-y-3">
                {links.map((link) => (
                  <li key={link.key}>
                    <a
                      href={link.href}
                      className="text-sm text-slate-400 transition-colors hover:text-white"
                    >
                      {t(`footer.links.${link.key}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Business partners — our sibling products */}
        <div className="mt-14 border-t border-slate-800 pt-8">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
            {t("footer.partners.title")}
          </h3>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {PARTNERS.map((p) => (
              <li key={p.href}>
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 transition-colors hover:text-white"
                >
                  {p.label}{" "}
                  <span className="text-slate-500">· {t(`footer.partners.${p.key}`)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 border-t border-slate-800 pt-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <HelmLogo />
              <span className="text-sm text-slate-400">{t("footer.tagline")}</span>
            </div>
            <p className="text-sm text-slate-400 sm:text-right">
              {t("footer.copyright")}
              <br />
              6511 Parkriver Crossing, Sugar Land, TX 77479
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
