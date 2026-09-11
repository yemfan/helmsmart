/**
 * Starter content for the marketing surface — the campaign bodies, SMS
 * messages and form fields a brand-new campaign or form begins with.
 *
 * Everything here becomes the ORGANIZATION'S OWN content the moment the owner
 * clicks a template button: they edit it, then send it to their customers or
 * publish it on their public form. So it is a starting point in the language
 * the owner is working in — a Spanish-speaking owner starts from Spanish, and
 * can still write to an English-speaking list by editing the text. It used to
 * be English for everyone, which handed a Spanish-speaking business an English
 * newsletter to send to Spanish-speaking customers.
 *
 * Two pieces are load-bearing in every language:
 *   - SMS: the literal keyword `STOP`. Carriers act on the keyword itself, so it
 *     stays in English inside a sentence written in the customer's language.
 *   - Email: the unsubscribe link. CAN-SPAM asks for a clear opt-out, not an
 *     English one; the link text is in the language of the email around it.
 *
 * What the owner READS about these — the template's NAME in the picker — is
 * copy, and lives in the `marketing.json` bundles under
 * `email.editor.templates.<key>` / `sms.editor.templates.<key>`. The `key`
 * here is what joins the two, and is the same in every language.
 *
 * Kept in a directive-free `.ts` module rather than inline in the editors so
 * the component files hold markup and copy only.
 */
import type { FormField } from "@/lib/actions/forms";

type TemplateLocale = "en" | "es" | "zh-Hans";

/** The starter-content language for an app locale; anything unknown is English. */
function templateLocale(locale: string | null | undefined): TemplateLocale {
  return locale === "es" || locale === "zh-Hans" ? locale : "en";
}

export type EmailTemplate = { key: "newsletter" | "offer" | "checkin"; subject: string; body: string };
export type SmsTemplate = { key: "reminder" | "offer" | "checkin" | "review"; text: string };

const FOOTER_STYLE = `style="font-size:12px;color:#888;"`;
const OFFER_STYLE = `style="font-size:18px;font-weight:bold;color:#4f46e5;"`;

const EMAIL_TEMPLATES: Record<TemplateLocale, readonly EmailTemplate[]> = {
  en: [
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

<p ${FOOTER_STYLE}>
  You're receiving this because you're a client of {{org_name}}.
  <a href="#">Unsubscribe</a>
</p>`,
    },
    {
      key: "offer",
      subject: "A special offer just for you, {{name}}",
      body: `<p>Hi {{name}},</p>

<p>We have a limited-time offer we wanted to share with you exclusively.</p>

<p ${OFFER_STYLE}>
  [Your offer here]
</p>

<p>This offer expires on [date]. Reply to this email or call us to take advantage.</p>

<p>Thank you for your continued trust,<br>{{org_name}}</p>

<p ${FOOTER_STYLE}>
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

<p ${FOOTER_STYLE}>
  <a href="#">Unsubscribe</a>
</p>`,
    },
  ],
  es: [
    {
      key: "newsletter",
      subject: "Novedades de {{org_name}} — {{month}}",
      body: `<p>Hola, {{name}}:</p>

<p>Le contamos las novedades de este mes en {{org_name}}...</p>

<h2>Novedades</h2>
<p>Agregue aquí sus novedades.</p>

<h2>Próximamente</h2>
<p>Comparta sus próximas ofertas, servicios o eventos.</p>

<p>Como siempre, gracias por su confianza.</p>

<p>Saludos cordiales,<br>El equipo de {{org_name}}</p>

<p ${FOOTER_STYLE}>
  Recibe este correo porque es cliente de {{org_name}}.
  <a href="#">Cancelar suscripción</a>
</p>`,
    },
    {
      key: "offer",
      subject: "Una oferta especial para usted, {{name}}",
      body: `<p>Hola, {{name}}:</p>

<p>Tenemos una oferta por tiempo limitado que queríamos compartir con usted en exclusiva.</p>

<p ${OFFER_STYLE}>
  [Su oferta aquí]
</p>

<p>Esta oferta vence el [fecha]. Responda a este correo o llámenos para aprovecharla.</p>

<p>Gracias por su confianza,<br>{{org_name}}</p>

<p ${FOOTER_STYLE}>
  <a href="#">Cancelar suscripción</a>
</p>`,
    },
    {
      key: "checkin",
      subject: "¿Cómo le va, {{name}}?",
      body: `<p>Hola, {{name}}:</p>

<p>Quería comunicarme con usted para saber cómo va todo.</p>

<p>Si hay algo en lo que podamos ayudarle, o si tiene preguntas sobre nuestros servicios, no dude en escribirnos.</p>

<p>¡Nos encantará saber de usted!</p>

<p>Saludos cordiales,<br>{{org_name}}</p>

<p ${FOOTER_STYLE}>
  <a href="#">Cancelar suscripción</a>
</p>`,
    },
  ],
  "zh-Hans": [
    {
      key: "newsletter",
      subject: "{{org_name}} 最新动态 — {{month}}",
      body: `<p>{{name}}，您好：</p>

<p>以下是 {{org_name}} 本月的最新动态……</p>

<h2>近期更新</h2>
<p>在此添加你的更新内容。</p>

<h2>即将推出</h2>
<p>介绍即将推出的优惠、服务或活动。</p>

<p>一如既往，感谢您的支持。</p>

<p>此致<br>{{org_name}} 团队</p>

<p ${FOOTER_STYLE}>
  您收到此邮件，是因为您是 {{org_name}} 的客户。
  <a href="#">退订</a>
</p>`,
    },
    {
      key: "offer",
      subject: "{{name}}，专属于您的特别优惠",
      body: `<p>{{name}}，您好：</p>

<p>我们有一项限时优惠，特别与您分享。</p>

<p ${OFFER_STYLE}>
  [在此填写优惠内容]
</p>

<p>本优惠将于 [日期] 截止。回复此邮件或致电我们即可享受。</p>

<p>感谢您一直以来的信任，<br>{{org_name}}</p>

<p ${FOOTER_STYLE}>
  <a href="#">退订</a>
</p>`,
    },
    {
      key: "checkin",
      subject: "{{name}}，近来可好？",
      body: `<p>{{name}}，您好：</p>

<p>想问候一下，看看您一切是否顺利。</p>

<p>如有任何需要我们帮忙的地方，或对我们的服务有任何疑问，欢迎随时联系我们。</p>

<p>期待您的回音！</p>

<p>祝好，<br>{{org_name}}</p>

<p ${FOOTER_STYLE}>
  <a href="#">退订</a>
</p>`,
    },
  ],
};

const SMS_TEMPLATES: Record<TemplateLocale, readonly SmsTemplate[]> = {
  en: [
    { key: "reminder", text: "Hi {name}, this is a reminder about your appointment tomorrow. Reply STOP to opt out." },
    { key: "offer", text: "Hi {name}, we have a special offer just for you this week! Call or text us to learn more. Reply STOP to opt out." },
    { key: "checkin", text: "Hi {name}, just checking in — how is everything going? Let us know if there's anything we can help with. Reply STOP to opt out." },
    { key: "review", text: "Hi {name}, thank you for being a valued client! We'd love if you left us a quick review. Reply STOP to opt out." },
  ],
  es: [
    { key: "reminder", text: "Hola, {name}: le recordamos su cita de mañana. Responda STOP para no recibir más mensajes." },
    { key: "offer", text: "Hola, {name}: ¡esta semana tenemos una oferta especial para usted! Llámenos o escríbanos para más información. Responda STOP para no recibir más mensajes." },
    { key: "checkin", text: "Hola, {name}: solo queríamos saber cómo va todo. Avísenos si podemos ayudarle en algo. Responda STOP para no recibir más mensajes." },
    { key: "review", text: "Hola, {name}: ¡gracias por su preferencia! Nos encantaría que nos dejara una reseña rápida. Responda STOP para no recibir más mensajes." },
  ],
  "zh-Hans": [
    { key: "reminder", text: "{name}，您好！温馨提醒您明天的预约。回复 STOP 退订。" },
    { key: "offer", text: "{name}，您好！本周我们为您准备了专属优惠，欢迎来电或发短信了解详情。回复 STOP 退订。" },
    { key: "checkin", text: "{name}，您好！想问候一下您近况如何，如有需要帮忙的地方请告诉我们。回复 STOP 退订。" },
    { key: "review", text: "{name}，您好！感谢您的支持！如能为我们留下简短评价，我们将不胜感激。回复 STOP 退订。" },
  ],
};

export type FormStarter = {
  title: string;
  slug: string;
  successMessage: string;
  newFieldLabel: string;
  fields: FormField[];
};

/** What a brand-new lead-capture form starts with, before the owner edits it. */
const FORM_STARTERS: Record<TemplateLocale, FormStarter> = {
  en: {
    title: "Contact Us",
    slug: "contact",
    successMessage: "Thanks! We'll be in touch shortly.",
    newFieldLabel: "New Field",
    fields: [
      { id: "name", type: "text", label: "Full Name", placeholder: "Your name", required: true },
      { id: "email", type: "email", label: "Email Address", placeholder: "you@example.com", required: true },
      { id: "phone", type: "phone", label: "Phone Number", placeholder: "(555) 000-0000", required: false },
      { id: "message", type: "textarea", label: "Message", placeholder: "How can we help?", required: false },
    ],
  },
  es: {
    title: "Contáctenos",
    slug: "contacto",
    successMessage: "¡Gracias! Nos comunicaremos con usted muy pronto.",
    newFieldLabel: "Campo nuevo",
    fields: [
      { id: "name", type: "text", label: "Nombre completo", placeholder: "Su nombre", required: true },
      { id: "email", type: "email", label: "Correo electrónico", placeholder: "usted@ejemplo.com", required: true },
      { id: "phone", type: "phone", label: "Teléfono", placeholder: "(555) 000-0000", required: false },
      { id: "message", type: "textarea", label: "Mensaje", placeholder: "¿En qué podemos ayudarle?", required: false },
    ],
  },
  "zh-Hans": {
    title: "联系我们",
    slug: "contact",
    successMessage: "谢谢！我们会尽快与您联系。",
    newFieldLabel: "新字段",
    fields: [
      { id: "name", type: "text", label: "姓名", placeholder: "您的姓名", required: true },
      { id: "email", type: "email", label: "电子邮箱", placeholder: "you@example.com", required: true },
      { id: "phone", type: "phone", label: "电话", placeholder: "(555) 000-0000", required: false },
      { id: "message", type: "textarea", label: "留言", placeholder: "请问有什么可以帮您？", required: false },
    ],
  },
};

/** Email starters in the language the owner is working in. */
export function emailTemplates(locale: string | null | undefined): readonly EmailTemplate[] {
  return EMAIL_TEMPLATES[templateLocale(locale)];
}

/** SMS starters in the language the owner is working in. */
export function smsTemplates(locale: string | null | undefined): readonly SmsTemplate[] {
  return SMS_TEMPLATES[templateLocale(locale)];
}

/** A new form's starting title, slug, fields and messages, in the owner's language. */
export function formStarter(locale: string | null | undefined): FormStarter {
  return FORM_STARTERS[templateLocale(locale)];
}
