/**
 * Public form submission handler
 * POST /api/forms/[slug]
 *
 * No authentication required — this is the public endpoint that embeds call.
 * Uses service role to bypass RLS for writing submissions.
 */

import { NextRequest, NextResponse } from "next/server";
import { intlLocale } from "@leadsmart/i18n";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { translatorFor } from "@/lib/i18n/translator";
import { userUiLocale } from "@/lib/i18n/userLocale";
import { orgOwnerRecipients } from "@/lib/org-recipients";
import { phoneMatchVariants } from "@/lib/phone";
import twilio from "twilio";
import { notifySlackFormSubmission, notifySlackNewLead } from "@/lib/integrations/slack";

const emailEnabled = Boolean(process.env.RESEND_API_KEY);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = await createServiceClient();

  try {
    const body = await request.json();

    // Find the form by slug — must search across all orgs since no auth context
    // The form's org_id is embedded in the form definition
    const { data: form } = await db
      .from("form_definitions")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (!form) {
      return NextResponse.json({ ok: false, error: "Form not found" }, { status: 404 });
    }

    // ── Abuse protection ────────────────────────────────────────────────────
    // 1) Honeypot: a hidden field named "_hp" that real users never fill.
    //    Bots auto-fill every input → silently accept (200) but drop the spam,
    //    so the bot can't distinguish a rejection.
    if (typeof body._hp === "string" && body._hp.trim() !== "") {
      return NextResponse.json({ ok: true, successMessage: form.success_message });
    }

    // 2) Per-form hourly cap: limit how many submissions a single form accepts
    //    per hour to blunt floods (legit forms rarely exceed this).
    const HOURLY_CAP = 60;
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count: recentCount } = await db
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id)
      .gte("created_at", oneHourAgo);
    if ((recentCount ?? 0) >= HOURLY_CAP) {
      return NextResponse.json(
        { ok: false, error: "Too many submissions right now. Please try again later." },
        { status: 429 }
      );
    }

    // 3) Per-IP rate limit: max 5 submissions from one IP to one form per 10 min.
    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    if (ip) {
      const tenMinAgo = new Date(Date.now() - 600_000).toISOString();
      const { count: ipCount } = await db
        .from("form_submissions")
        .select("id", { count: "exact", head: true })
        .eq("form_id", form.id)
        .eq("ip_address", ip)
        .gte("created_at", tenMinAgo);
      if ((ipCount ?? 0) >= 5) {
        return NextResponse.json(
          { ok: false, error: "You've submitted this form a few times. Please wait a bit." },
          { status: 429 }
        );
      }
    }

    // Extract name/email/phone from submission data for quick access
    const fields = (form.fields ?? []) as Array<{ id: string; type: string; label: string }>;
    const emailField = fields.find((f) => f.type === "email" || f.label.toLowerCase().includes("email"));
    const phoneField = fields.find((f) => f.type === "phone" || f.label.toLowerCase().includes("phone"));
    const nameField = fields.find(
      (f) => f.label.toLowerCase().includes("name") && !f.label.toLowerCase().includes("company")
    );

    const email = emailField ? (body[emailField.id] as string) || null : null;
    const phone = phoneField ? (body[phoneField.id] as string) || null : null;
    const name = nameField ? (body[nameField.id] as string) || null : null;

    // Validate required fields
    for (const field of fields) {
      if ((field as { required?: boolean }).required && !body[field.id]?.toString().trim()) {
        return NextResponse.json(
          { ok: false, error: `${field.label} is required` },
          { status: 400 }
        );
      }
    }

    // Auto-create/match client if enabled
    let clientId: string | null = null;
    if (form.auto_create_client && (email || phone)) {
      // Try to find existing client. A phone typed into a form is rarely in the
      // shape the client was stored in, so it is matched in every common shape.
      // More than one can match; the oldest is the client, not a later lead.
      const phoneVariants = email ? [] : phoneMatchVariants(phone == null ? null : String(phone));
      let clientQuery = db
        .from("clients")
        .select("id")
        .eq("organization_id", form.organization_id);

      if (email) {
        clientQuery = clientQuery.eq("email", email);
      } else {
        clientQuery = clientQuery.in("phone", phoneVariants);
      }

      const { data: existing } =
        email || phoneVariants.length
          ? await clientQuery.order("created_at", { ascending: true }).limit(1).maybeSingle()
          : { data: null };

      if (existing) {
        clientId = existing.id;
      } else if (name || email) {
        // Create new lead
        const nameParts = (name ?? "").split(" ").filter(Boolean);
        const { data: newClient } = await db
          .from("clients")
          .insert({
            organization_id: form.organization_id,
            first_name: nameParts[0] ?? email?.split("@")[0] ?? "Lead",
            last_name: nameParts.slice(1).join(" ") || null,
            email: email || null,
            phone: phone || null,
            status: "lead",
            source: "form",
          })
          .select("id")
          .single();

        clientId = newClient?.id ?? null;
      }
    }

    // Record submission
    const { error: subError } = await db.from("form_submissions").insert({
      organization_id: form.organization_id,
      form_id: form.id,
      data: body,
      email,
      phone,
      name,
      client_id: clientId,
      ip_address: request.headers.get("x-forwarded-for") || null,
      user_agent: request.headers.get("user-agent") || null,
      referrer: request.headers.get("referer") || null,
    });

    if (subError) {
      console.error("[forms] submission insert error:", subError);
      return NextResponse.json({ ok: false, error: "Failed to save submission" }, { status: 500 });
    }

    // Increment submission count (best-effort)
    try {
      await db
        .from("form_definitions")
        .update({ submission_count: (form.submission_count ?? 0) + 1 })
        .eq("id", form.id);
    } catch {
      // Non-critical
    }

    // Notify via email
    //
    // This alert is the OWNER's half of a form submission — the visitor's half
    // is `form.success_message` below, which stays in whatever language the
    // owner wrote the form in. There is no request behind this one either: the
    // visitor's browser is what called us, and their language is not the
    // owner's. So the copy comes from the recipient's stored preference.
    const notifyEmail = form.notify_email;
    if (notifyEmail && emailEnabled) {
      // `notify_email` is a free-text address. When it belongs to an owner or
      // admin of the org we know their language; when it is a shared inbox or
      // an outside bookkeeper, nobody has a stored preference and it is
      // English — the same answer as before, reached honestly.
      const owners = await orgOwnerRecipients(db, form.organization_id);
      const match = owners.find(
        (r) => r.email.toLowerCase() === String(notifyEmail).toLowerCase(),
      );
      const locale = match ? await userUiLocale(match.userId) : null;
      const t = translatorFor(locale, "emails");

      const fieldLines = fields
        .map((f: { id: string; label: string }) => `<tr><td style="padding:4px 0;font-weight:bold;">${f.label}:</td><td style="padding:4px 8px;">${body[f.id] ?? "—"}</td></tr>`)
        .join("\n");

      await sendEmail({
        fromName: t("formAlert.fromName"),
        to: notifyEmail,
        subject: t("formAlert.subject", { form: form.title }),
        html: `
          <h2 style="margin:0 0 16px">${t("formAlert.heading", { form: form.title })}</h2>
          <table style="border-collapse:collapse;font-size:14px;">
            ${fieldLines}
          </table>
          <p style="margin-top:16px;color:#64748b;font-size:12px;">
            ${t("formAlert.submitted", { date: new Date().toLocaleString(intlLocale(locale)) })} ·
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/forms/${form.id}/submissions">${t("formAlert.view")}</a>
          </p>
        `,
      }).catch((e) => console.error("[forms] email notify error:", e));
    }

    // Notify via Slack (fire-and-forget)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    // If a new client was created, send new-lead notification
    if (clientId && name && !email) {
      void notifySlackNewLead(form.organization_id, {
        name: name ?? "Lead",
        email: email ?? undefined,
        phone: phone ?? undefined,
        source: "form",
        clientUrl: `${appUrl}/clients/${clientId}`,
      });
    }

    void notifySlackFormSubmission(form.organization_id, {
      formTitle: form.title,
      name: name ?? undefined,
      email: email ?? undefined,
      phone: phone ?? undefined,
      submissionsUrl: `${appUrl}/forms/${form.id}/submissions`,
      clientUrl: clientId ? `${appUrl}/clients/${clientId}` : undefined,
    });

    // Notify via SMS if enabled
    if (form.notify_sms) {
      const { data: org } = await db
        .from("organizations")
        .select("twilio_number")
        .eq("id", form.organization_id)
        .maybeSingle();

      if (org?.twilio_number && process.env.TWILIO_ACCOUNT_SID) {
        const twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        // Find owner's phone to notify
        const { data: ownerMember } = await db
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", form.organization_id)
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();

        if (ownerMember) {
          // Get owner's phone from auth users (not directly accessible via service role)
          // So we log it and skip the SMS for now
          console.log("[forms] SMS notify: owner not found for org", form.organization_id);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      successMessage: form.success_message,
      redirectUrl: form.redirect_url || null,
    });
  } catch (error) {
    console.error("[forms] submission error:", error);
    return NextResponse.json({ ok: false, error: "Submission failed" }, { status: 500 });
  }
}
