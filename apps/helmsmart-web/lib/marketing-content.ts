/**
 * Starter content for the marketing surface — the campaign bodies, SMS
 * messages and form fields a brand-new campaign or form begins with.
 *
 * NOT copy, and deliberately not translated. Everything here becomes the
 * ORGANIZATION'S OWN content the moment the owner clicks a template button:
 * it is sent to their customers or published on their public form, so it
 * follows the business's audience, not the language the owner happens to read
 * HelmSmart in. Two pieces are load-bearing on top of that — the SMS
 * "Reply STOP to opt out" wording and the email `Unsubscribe` link are what US
 * carriers and CAN-SPAM look for, and a translated version of either is a
 * compliance defect, not a localisation.
 *
 * What the owner READS about these — the template's NAME in the picker — IS
 * copy, and lives in the `marketing.json` bundles under
 * `email.editor.templates.<key>` / `sms.editor.templates.<key>`. The `key`
 * here is what joins the two.
 *
 * Kept in a directive-free `.ts` module rather than inline in the editors so
 * the component files hold markup and copy only.
 */
import type { FormField } from "@/lib/actions/forms";

export const EMAIL_TEMPLATES = [
  {
    key: "newsletter",
    subject: "What's new at {{org_name}} — {{month}}",
    body: `<p>Hi {{name}},</p>

<p>Here's what we've been up to this month at {{org_name}}...</p>

<h2>Updates</h2>
<p>Add your updates here.</p>

<h2>What's coming</h2>
<p>Share upcoming offers, services, or events.</p>

<p>As always, thank you for being a valued client.</p>

<p>Best,<br>The {{org_name}} team</p>

<p style="font-size:12px;color:#888;">
  You're receiving this because you're a client of {{org_name}}.
  <a href="#">Unsubscribe</a>
</p>`,
  },
  {
    key: "offer",
    subject: "A special offer just for you, {{name}}",
    body: `<p>Hi {{name}},</p>

<p>We have a limited-time offer we wanted to share with you exclusively.</p>

<p style="font-size:18px;font-weight:bold;color:#4f46e5;">
  [Your offer here]
</p>

<p>This offer expires on [date]. Reply to this email or call us to take advantage.</p>

<p>Thank you for your continued trust,<br>{{org_name}}</p>

<p style="font-size:12px;color:#888;">
  <a href="#">Unsubscribe</a>
</p>`,
  },
  {
    key: "checkin",
    subject: "Checking in — {{name}}",
    body: `<p>Hi {{name}},</p>

<p>I wanted to reach out and see how everything is going on your end.</p>

<p>If there's anything we can help with, or if you have questions about our services, please don't hesitate to reach out.</p>

<p>We'd love to hear from you!</p>

<p>Warm regards,<br>{{org_name}}</p>

<p style="font-size:12px;color:#888;">
  <a href="#">Unsubscribe</a>
</p>`,
  },
] as const;

export const SMS_TEMPLATES = [
  {
    key: "reminder",
    text: "Hi {name}, this is a reminder about your appointment tomorrow. Reply STOP to opt out.",
  },
  {
    key: "offer",
    text: "Hi {name}, we have a special offer just for you this week! Call or text us to learn more. Reply STOP to opt out.",
  },
  {
    key: "checkin",
    text: "Hi {name}, just checking in — how is everything going? Let us know if there's anything we can help with. Reply STOP to opt out.",
  },
  {
    key: "review",
    text: "Hi {name}, thank you for being a valued client! We'd love if you left us a quick review. Reply STOP to opt out.",
  },
] as const;

/** What a brand-new lead-capture form starts with, before the owner edits it. */
export const DEFAULT_FORM_TITLE = "Contact Us";
export const DEFAULT_FORM_SLUG = "contact";
export const DEFAULT_SUCCESS_MESSAGE = "Thanks! We'll be in touch shortly.";
export const NEW_FIELD_LABEL = "New Field";

export const DEFAULT_FORM_FIELDS: FormField[] = [
  { id: "name", type: "text", label: "Full Name", placeholder: "Your name", required: true },
  { id: "email", type: "email", label: "Email Address", placeholder: "you@example.com", required: true },
  { id: "phone", type: "phone", label: "Phone Number", placeholder: "(555) 000-0000", required: false },
  { id: "message", type: "textarea", label: "Message", placeholder: "How can we help?", required: false },
];
