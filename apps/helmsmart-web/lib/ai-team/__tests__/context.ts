/**
 * An ActionContext over a fake database, with the real English bundles as its
 * translators — the owner-facing sentences the tests assert are the ones that
 * ship.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { translatorFor } from "@/lib/i18n/translator";
import type { OrgRole } from "@/lib/permissions";
import { teamFaces } from "../faces";
import type { ActionContext } from "../types";
import type { FakeDb } from "./fake-db";

export const ORG = "11111111-1111-4111-8111-111111111111";
export const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
export const USER = "33333333-3333-4333-8333-333333333333";

export function testContext(db: FakeDb, over: Partial<ActionContext> & { role?: OrgRole | null } = {}): ActionContext {
  return {
    db: db as unknown as SupabaseClient,
    orgId: ORG,
    userId: USER,
    role: "owner",
    today: "2026-09-11",
    timezone: "America/New_York",
    locale: "en",
    currency: "USD",
    i18n: {
      home: translatorFor("en", "home"),
      inbox: translatorFor("en", "inbox"),
      clients: translatorFor("en", "clients"),
    },
    team: teamFaces([]),
    now: new Date("2026-09-11T17:00:00Z"),
    ...over,
  };
}
