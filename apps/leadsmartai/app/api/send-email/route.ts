import { NextResponse } from "next/server";
import { Resend } from "resend";
import { EMAIL_BRAND } from "@/lib/email";

type SendEmailBody = {
  to: string;
  name?: string;
  address: string;
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "RESEND_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as SendEmailBody;
    const { to, name, address } = body;

    if (!to || !address) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: to, address." },
        { status: 400 }
      );
    }

    const resend = new Resend(apiKey);

    const url = new URL(req.url);
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || `${url.protocol}//${url.host}`;

    const reportLink = `${siteUrl}/?address=${encodeURIComponent(address)}`;

    const subject = "Your Home Value Report";
    const text = `Hi ${name || "there"},

Here is a quick link to view your home value report:

Name: ${name || "(not provided)"}
Address: ${address}

View your report:
${reportLink}

If you have any questions about this estimate or next steps, just reply to this email.

— ${EMAIL_BRAND}`;

    const { error } = await resend.emails.send({
      from: `${EMAIL_BRAND} <noreply@closebossai.com>`,
      to,
      subject,
      text,
    });

    if (error) {
      console.error("Resend send error", error);
      return NextResponse.json(
        { ok: false, error: "Failed to send email." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("POST /api/send-email error", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

