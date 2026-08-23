import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { isAdmin, requirePartner } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ACADEMY_COURSES, ACADEMY_TRACKS } from "@/content/academy";
import { PARTNER_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { Badge, Card } from "@/components/ui/primitives";
import { StatGrid, StatTile } from "@/components/ui/stat";
import { Disclaimer } from "@/components/ui/disclaimer";

export const metadata: Metadata = { title: "Academy" };

/**
 * Mark a course complete for the signed-in Partner.
 *
 * Writes through the session client, so RLS is what confines the write to the
 * caller's own progress row - the partner id is never taken from the form.
 */
async function markCourseComplete(formData: FormData) {
  "use server";
  const courseKey = String(formData.get("courseKey") ?? "");
  if (!courseKey || !isSupabaseConfigured()) return;

  const partner = await requirePartner("/dashboard/academy");
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("abw_academy_courses")
    .select("id")
    .eq("key", courseKey)
    .maybeSingle();
  if (!course) return;

  // Course-level progress is keyed by a partial unique index (lesson_id is
  // null), which PostgREST cannot target with on_conflict - so read, then write.
  const { data: existing } = await supabase
    .from("abw_academy_progress")
    .select("id")
    .eq("partner_id", partner.id)
    .eq("course_id", course.id)
    .is("lesson_id", null)
    .maybeSingle();

  const completion = { status: "completed", completed_at: new Date().toISOString() };

  if (existing) {
    await supabase.from("abw_academy_progress").update(completion).eq("id", existing.id);
  } else {
    await supabase.from("abw_academy_progress").insert({
      partner_id: partner.id,
      course_id: course.id,
      lesson_id: null,
      ...completion,
    });
  }

  revalidatePath("/dashboard/academy");
}

interface ProgressRow {
  course_id: string;
  status: string;
  completed_at: string | null;
  abw_academy_courses: { key: string } | { key: string }[] | null;
}

export default async function AcademyDashboardPage() {
  const partner = await requirePartner("/dashboard/academy");
  const admin = await isAdmin();

  const completed = new Set<string>();
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("abw_academy_progress")
        .select("course_id, status, completed_at, abw_academy_courses(key)")
        .eq("partner_id", partner.id)
        .eq("status", "completed");

      for (const row of (data ?? []) as unknown as ProgressRow[]) {
        const course = Array.isArray(row.abw_academy_courses)
          ? row.abw_academy_courses[0]
          : row.abw_academy_courses;
        if (course?.key) completed.add(course.key);
      }
    } catch {
      // Progress is additive information; the curriculum still renders without it.
    }
  }

  const requiredKeys = ACADEMY_COURSES.filter((c) => c.isRequiredForLeadership).map((c) => c.key);
  const requiredDone = requiredKeys.filter((k) => completed.has(k)).length;

  return (
    <DashboardShell
      nav={[...PARTNER_NAV]}
      isAdmin={admin}
      title="Partner Academy"
      subtitle="Product knowledge, sales skills, and the training required for Leadership."
    >
      <div className="space-y-6">
        <StatGrid cols={3}>
          <StatTile
            label="Courses completed"
            value={`${completed.size} of ${ACADEMY_COURSES.length}`}
          />
          <StatTile
            label="Leadership training"
            value={`${requiredDone} of ${requiredKeys.length}`}
            hint="Required before Leader qualification"
            tone={requiredDone === requiredKeys.length ? "positive" : "neutral"}
          />
          <StatTile
            label="Account status"
            value={partner.status === "active" ? "Active" : "Pending"}
            tone={partner.status === "active" ? "positive" : "muted"}
          />
        </StatGrid>

        {ACADEMY_TRACKS.map((track) => {
          const courses = ACADEMY_COURSES.filter((c) => c.track === track.key);
          if (!courses.length) return null;
          return (
            <section key={track.key}>
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
                {track.name}
              </h2>
              <p className="mt-1 text-sm text-muted">{track.detail}</p>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => {
                  const done = completed.has(course.key);
                  return (
                    <li key={course.key}>
                      <Card className="flex h-full flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-base font-semibold tracking-tight text-ink">
                            {course.title}
                          </h3>
                          {done ? (
                            <Badge tone="success">Complete</Badge>
                          ) : course.isRequiredForLeadership ? (
                            <Badge tone="gold">Leadership</Badge>
                          ) : null}
                        </div>
                        <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                          {course.summary}
                        </p>
                        <p className="mt-4 text-xs text-navy-500">
                          {course.lessonCount} lessons &middot; {course.durationMinutes} min
                        </p>
                        {!done && partner.status === "active" ? (
                          <form action={markCourseComplete} className="mt-4">
                            <input type="hidden" name="courseKey" value={course.key} />
                            <button
                              type="submit"
                              className="w-full rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:border-navy-300"
                            >
                              Mark complete
                            </button>
                          </form>
                        ) : null}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <Disclaimer>
          Course completion is recorded against your Partner account and feeds the Leadership
          qualification check. Lesson content is published by AI Business Works; the curriculum
          above reflects what is currently available.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}
