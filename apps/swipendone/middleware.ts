import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on app pages and auth callback; skip static assets and the public API.
  matcher: ["/app/:path*", "/login", "/auth/:path*"],
};
