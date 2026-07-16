import Image from "next/image";
import Link from "next/link";
import { company } from "@/lib/content";
import { NavLinks } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto w-[92%] max-w-[1120px]">
        <nav className="flex h-[76px] items-center justify-between gap-6">
          {/* "/" not "#top" — the header renders on /contact too, where #top doesn't exist. */}
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/maxy-logo.png"
              alt=""
              width={48}
              height={48}
              priority
              className="h-12 w-12 object-contain"
            />
            <span className="block">
              {/* The full name needs room the 375px header doesn't have; drop to
                  the wordmark on mobile and keep the name for screen readers. */}
              <span className="sr-only">{company.name}</span>
              <span
                aria-hidden
                className="block font-serif text-xl font-bold text-navy-800 sm:hidden"
              >
                MAXY
              </span>
              <span
                aria-hidden
                className="hidden font-serif text-xl font-bold text-navy-800 sm:block"
              >
                {company.name}
              </span>
              <span className="hidden text-[11px] font-extrabold tracking-wide text-brand-500 sm:block">
                {company.tagline}
              </span>
            </span>
          </Link>

          <NavLinks />
        </nav>
      </div>
    </header>
  );
}
