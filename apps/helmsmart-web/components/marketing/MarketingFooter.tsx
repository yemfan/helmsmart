import { HelmLogo } from "@/components/logo";

// Sibling businesses under MAXY Investment — cross-promoted in every footer.
// This app is HelmSmart, so it links to the other three.
const PARTNERS = [
  { label: "Property Tools AI", blurb: "Real estate tools & data", href: "https://www.propertytoolsai.com" },
  { label: "CloseBoss", blurb: "Your AI real estate team", href: "https://www.closebossai.com" },
  { label: "MarketingBoss", blurb: "AI marketing creative", href: "https://marketingbossai.com" },
];

const footerLinks = {
  Product: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Schedule Demo", href: "/contact/sales" },
    { label: "Start Free Trial", href: "/signup" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: "/contact" },
  ],
  Resources: [
    { label: "FAQ", href: "/faq" },
    { label: "Sign In", href: "/login" },
    { label: "Get Started", href: "/signup" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
  ],
};

export function MarketingFooter() {
  return (
    <footer className="bg-slate-900 text-white">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
                {category}
              </h3>
              <ul className="mt-4 space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-slate-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Business partners — our sibling products */}
        <div className="mt-14 border-t border-slate-800 pt-8">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Business partners</h3>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {PARTNERS.map((p) => (
              <li key={p.href}>
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 transition-colors hover:text-white"
                >
                  {p.label} <span className="text-slate-500">· {p.blurb}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 border-t border-slate-800 pt-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <HelmLogo />
              <span className="text-sm text-slate-400">More control, less effort</span>
            </div>
            <p className="text-sm text-slate-400 sm:text-right">
              &copy; 2026 MAXY Investment Inc. HelmSmart is a DBA of MAXY Investment Inc. All rights reserved.
              <br />
              6511 Parkriver Crossing, Sugar Land, TX 77479
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
