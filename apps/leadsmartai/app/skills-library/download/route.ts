import { buildSkillsPackMarkdown, SKILLS_PACK_FILENAME } from "@/lib/closeboss/skills/pack";

// The catalog is static, so the pack can be generated at build time.
export const dynamic = "force-static";

export function GET() {
  const md = buildSkillsPackMarkdown();
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${SKILLS_PACK_FILENAME}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
