import Link from "next/link";
import { Mark } from "@/components/site/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas-alt px-6">
      <div className="max-w-md text-center">
        <div className="inline-flex">
          <Mark size={44} />
        </div>
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight text-ink">
          We could not find that page
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          The link may be out of date, or the page may have moved. Nothing is wrong with your
          account.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
          >
            Go to the homepage
          </Link>
          <Link
            href="/faq"
            className="rounded-xl border border-hairline bg-white px-5 py-2.5 text-sm font-semibold text-navy-700 hover:border-navy-300"
          >
            Read the FAQ
          </Link>
        </div>
      </div>
    </div>
  );
}
