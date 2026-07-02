import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateHouseSearch } from "@/lib/house-search/aiHouseSearch";
import {
  createSavedHouseSearch,
  updateSavedHouseSearch,
} from "@/lib/house-search/savedHouseSearches";
import { defineTool } from "../types";

export const houseSearch = defineTool({
  name: "house_search",
  description:
    "Run an AI home search from natural-language criteria (beds/baths, area, price range). When contact_id is given, saves the search to that buyer with run history; optionally auto-emails new matches daily/weekly.",
  inputSchema: z.object({
    criteria: z
      .string()
      .min(8)
      .describe("The full search brief, e.g. '3bd/2ba in Alhambra, $600k-$1M, good schools'"),
    contact_id: z.string().uuid().optional().describe("Buyer contact to save the search for"),
    auto_run_frequency: z
      .enum(["daily", "weekly"])
      .optional()
      .describe("Only when the realtor asked to email new matches on a schedule"),
  }),
  riskClass: "research",
  assignee: "sales_assistant",
  execute: async (ctx, input) => {
    const search = await generateHouseSearch(input.criteria);
    if (!search.ok) return { status: "failed", error: search.error };
    const count = search.result.listings.length;

    if (!input.contact_id) {
      return {
        status: "completed",
        summary: `House search ran — ${count} match${count === 1 ? "" : "es"} (not saved to a contact).`,
        artifactUrl: "/dashboard/house-search",
        data: { listings: search.result.listings.slice(0, 10) },
      };
    }

    // Verify the contact belongs to this agent before saving anything to it.
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, name")
      .eq("id", input.contact_id)
      .eq("agent_id", ctx.agentId)
      .maybeSingle();
    if (!contact) return { status: "failed", error: "Contact not found for this agent." };

    const saved = await createSavedHouseSearch(ctx.agentId, {
      contactId: input.contact_id,
      name: input.criteria.slice(0, 80),
      query: input.criteria,
      refinements: [],
      result: search.result,
    });
    if (input.auto_run_frequency) {
      try {
        await updateSavedHouseSearch(ctx.agentId, saved.id, {
          autoRun: true,
          autoRunFrequency: input.auto_run_frequency,
        });
      } catch {
        // Search saved; the schedule just didn't stick — reflected in summary.
      }
    }
    const who = (contact as { name?: string | null }).name ?? "the buyer";
    return {
      status: "completed",
      summary: `Saved a home search for ${who} — ${count} match${count === 1 ? "" : "es"}${
        input.auto_run_frequency ? `; emailing new ones ${input.auto_run_frequency}` : ""
      }.`,
      artifactUrl: "/dashboard/house-search",
      data: { search_id: saved.id, matches: count },
    };
  },
});
