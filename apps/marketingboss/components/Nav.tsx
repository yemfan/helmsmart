"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Nav({ email, credits }: { email: string; credits?: number }) {
  const router = useRouter();
  const pathname = usePathname();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center gap-3">
      <Link href="/" className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-boss-violet/15 text-lg font-black text-boss-gold ring-1 ring-white/10">
          M
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight tracking-tight">
            Marketing<span className="text-boss-gold">Boss</span> AI
          </h1>
          <p className="text-[11px] text-white/45">Cinematic marketing creative on demand</p>
        </div>
      </Link>

      <nav className="ml-auto flex items-center gap-1.5 text-sm">
        {typeof credits === "number" && (
          <span
            title="Generation credits remaining"
            className="mr-1 rounded-full border border-boss-gold/30 bg-boss-gold/10 px-2.5 py-1 text-xs font-semibold text-boss-gold"
          >
            {credits} credits
          </span>
        )}
        <Link
          href="/"
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            pathname === "/" ? "bg-white/10 text-white" : "text-white/55 hover:text-white"
          }`}
        >
          Studio
        </Link>
        <Link
          href="/gallery"
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            pathname === "/gallery" ? "bg-white/10 text-white" : "text-white/55 hover:text-white"
          }`}
        >
          Gallery
        </Link>
        <button
          onClick={signOut}
          title={email}
          className="ml-1 rounded-lg px-3 py-1.5 font-medium text-white/45 transition hover:text-white"
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}
