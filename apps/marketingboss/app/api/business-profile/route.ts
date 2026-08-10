import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { researchBusinessProfile } from "@/lib/businessProfile";

// Live web research on the company site — give it room.
export const maxDuration = 300;
export const runtime = "nodejs";

/** Research the user's company URL → business info + tailored topic presets. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let url = "";
  try {
    const body = (await req.json()) as { url?: unknown };
    if (typeof body.url === "string") url = body.url.trim();
  } catch {
    /* validated below */
  }
  // Accept bare domains ("www.avasc.org") — people rarely type the scheme.
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const host = new URL(url).hostname;
    if (!host.includes(".")) throw new Error("no tld");
  } catch {
    return NextResponse.json(
      { error: "Enter your company's website — e.g. www.yourcompany.com" },
      { status: 400 },
    );
  }

  try {
    const profile = await researchBusinessProfile(user.id, url);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't research that site — please try again." },
      { status: 500 },
    );
  }
}
