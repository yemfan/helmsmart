# Translating a HelmSmart surface

How a page or component moves from English-in-source to the bundle. The
design is in `i18n-design.md`; this is the mechanical part.

## Where things are

| Thing | Path |
| --- | --- |
| App config: cookie name, `SUPPORTED_LOCALES`, namespaces, resources | `lib/i18n/config.ts` |
| Server: `getServerLocale()`, `getServerT(ns)` | `lib/i18n/server.ts` |
| Client: `<I18nProvider>`, `useSetLocale()` | `lib/i18n/client.tsx` |
| Request-free: `translatorFor(locale, ns)` (emails, crons) | `lib/i18n/translator.ts` |
| Cron-side locale: `userUiLocale(userId)`, `userUiLocales(ids)` | `lib/i18n/userLocale.ts` |
| AI prompts: `languageDirective(locale)` and variants | `lib/i18n/directives.ts` |
| `intlLocale(locale)` → `en-US` / `zh-CN` / `es-US` | `import { intlLocale } from "@leadsmart/i18n"` |
| Bundles | `messages/en/<ns>.json`, `messages/zh-Hans/<ns>.json` |
| Guards | `lib/i18n/__tests__/` — `npx vitest run lib/i18n` |

Namespaces (one per surface; see `config.ts`): `common`, `nav`, `settings`,
`auth`, `home`, `inbox`, `clients`, `tasks`, `pipeline`, `projects`,
`workflows`, `voice`, `marketing`, `books`, `site`, `emails`.

`common` is the shared package's generic verbs (`actions.save`,
`actions.cancel`, `status.saving`, `actions.saved` …, already in zh-Hans)
overlaid with `messages/*/common.json`. Read
`packages/i18n/locales/en/common.json` before adding a generic verb — it is
probably there.

## Server Components and server actions

```tsx
import { getServerT, getServerLocale } from "@/lib/i18n/server";

export default async function Page() {
  const t = await getServerT("books");           // bind the namespace ONCE
  const locale = await getServerLocale();        // only if you format dates/money
  return <h1>{t("invoices.title")}</h1>;
}
```

Server actions run inside a request, so `getServerT` works there too — an
error the owner reads comes back already translated:

```ts
"use server";
const t = await getServerT("books");
return { ok: false, error: t("invoices.errors.notFound") };
```

`generateMetadata` is a Server Component function; use `getServerT("site")`
or the page's own namespace for `title`.

## Client Components

```tsx
"use client";
import { useTranslation } from "react-i18next";

const { t, i18n } = useTranslation("books");     // bind the namespace ONCE
<button>{isPending ? t("common:status.saving") : saved ? t("common:actions.saved_bang", { defaultValue: "Saved!" }) : t("invoices.save")}</button>
```

`ns:key` reaches another namespace from a bound hook. `"use client"` must
stay the FIRST statement — put the import below it. A client module must
never import `@/lib/i18n/server`.

## Keys

- Nested objects, camelCase leaves, grouped by screen then element:
  `invoices.list.title`, `invoices.list.empty`, `invoices.form.dueDate`.
- Interpolation is `{{name}}`: `"due {{date}}"`. Never build a sentence out
  of two half-strings — word order differs in Chinese.
- Plurals: `"items_one": "{{count}} item"`, `"items_other": "{{count}} items"`,
  called as `t("items", { count })`. The zh-Hans bundle needs only
  `items_other`. Works in both `useTranslation` and `getServerT`.
- Data that is not copy — enum values a parser reads, hrefs, class names,
  IDs — stays in source. Label maps keyed by enum
  (`{ paid: "Paid", overdue: "Overdue" }`) become `t(\`status.${status}\`)`
  with every enum value present in the bundle.
- Copy in a module-scope array (`const PLANS = [{ title: "…" }]`) becomes a
  key held in the array and translated at render.

## Dates and money

Every `toLocaleDateString("en-US", …)`, `toLocaleString()`, and
`new Intl.DateTimeFormat("en-US")` takes the reader's locale:

```ts
import { intlLocale } from "@leadsmart/i18n";
d.toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric" })   // server: locale from getServerLocale()
d.toLocaleDateString(intlLocale(i18n.language), …)                              // client: from useTranslation()
new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency }).format(n)
```

`lib/metrics-format.ts` and similar helpers take a `locale` argument;
callers pass it explicitly. A helper with a default of `"en-US"` is a bug the
guard catches.

## Chinese (zh-Hans) style

- 简体中文, plain business register, no exclamation marks except `已保存！`.
- Product and people nouns stay as they are: HelmSmart, Tim, Emma, Alex,
  Emily, Mark, Google Business, Stripe, Plaid, Twilio, Slack, QuickBooks.
- Fixed terms: Books 账务 · Invoices 发票 · Quotes/Estimates 报价单 · Bills
  账单 · Expenses 支出 · Vendors 供应商 · Clients 客户 · Pipeline 销售管道 ·
  Timesheets 工时表 · Workflows 工作流 · Automations 自动化 · Inbox 收件箱 ·
  Tasks 任务 · Calendar 日历 · Command Center 指挥中心 · AI Receptionist
  AI 前台接待 · AI Client Assistant AI 客户助理 · Reception 前台 · Insights
  经营洞察 · Save changes 保存更改 · Saving… 保存中… · Saved! 已保存！ ·
  Cancel 取消 · Delete 删除 · Edit 编辑 · Sign in 登录 · Sign up 注册 ·
  Log out 退出登录.
- Keep `{{placeholders}}` byte-identical. Keep the `_one`/`_other` suffixes.
- A value that is byte-identical to the English is only right for a URL, a
  proper noun, or an interpolation-only string. The guard fails the rest.

## Spanish (es) style

- **`es` with no region tag**, formatted through `es-US`: the customers are US
  small businesses, so the currency is USD and the date order is the one their
  bank statements use.
- **Usted, not tú.** This is business software addressing a business owner.
  Commands to the app stay in the infinitive on buttons (`Guardar cambios`,
  `Cancelar`), which is the convention every Spanish-language SaaS uses, and
  prose addressed to the owner uses usted (`Su empresa`, `Puede…`).
- **Sentence case**, not Title Case. Spanish does not capitalise every word in
  a heading, and it does not capitalise days, months, or languages.
- Keep the inverted opening marks: `¿Cómo podemos ayudar?`, `¡Guardado!`.
- Product and people nouns stay: HelmSmart, Tim, Emma, Alex, Emily, Mark,
  Google Business, Stripe, Plaid, Twilio, Slack, QuickBooks, Resend, Retell,
  1099, PDF, CSV, OFX, SMS.
- **Plurals**: Spanish has `one` and `other`, like English. A key with `_one`
  in the English bundle needs `_one` and `_other` in Spanish too — unlike
  zh-Hans, which takes `_other` alone.

Fixed terms, matching the Chinese glossary one for one:

| English | Español |
| --- | --- |
| Books | Contabilidad |
| Invoices | Facturas |
| Quotes / Estimates | Presupuestos |
| Bills | Facturas de proveedor |
| Expenses | Gastos |
| Vendors | Proveedores |
| Journal | Libro diario |
| Chart of accounts | Plan de cuentas |
| Aging | Antigüedad de saldos |
| Accounts receivable | Cuentas por cobrar |
| Accounts payable | Cuentas por pagar |
| Reconcile | Conciliar |
| Transactions | Transacciones |
| Reports | Informes |
| Clients | Clientes |
| Pipeline | Embudo de ventas |
| Timesheets | Partes de horas |
| Workflows | Flujos de trabajo |
| Automations | Automatizaciones |
| Inbox | Bandeja de entrada |
| Tasks | Tareas |
| Calendar | Calendario |
| Command Center | Centro de mando |
| Insights | Análisis del negocio |
| AI Receptionist | Recepcionista con IA |
| AI Client Assistant | Asistente de clientes con IA |
| Reception | Recepción |
| Settings | Configuración |
| Save changes | Guardar cambios |
| Saving… | Guardando… |
| Saved! | ¡Guardado! |
| Cancel | Cancelar |
| Delete | Eliminar |
| Edit | Editar |
| Sign in | Iniciar sesión |
| Sign up | Crear cuenta |
| Log out | Cerrar sesión |

## Owner-facing AI text

Append the directive to the system prompt of a generator whose output the
OWNER reads (Ask, Tim's briefing, client brief, insights, categorizer
notes); never to one whose output reaches a CUSTOMER (reply drafts,
reminders, campaigns, the receptionist — `lib/language.ts` handles those):

```ts
import { languageDirective, languageDirectiveForJson } from "@/lib/i18n/directives";
system: BASE_PROMPT + languageDirective(locale)          // prose the owner reads
system: BASE_PROMPT + languageDirectiveForJson(locale)   // JSON the code parses
```

`locale` is `await getServerLocale()` in a request, or
`await userUiLocale(userId)` in a cron.

## Done means

1. `npx tsc --noEmit` clean.
2. `npx vitest run lib/i18n` green — the guards scan every file that calls
   `useTranslation` or `getServerT`, so a half-translated file fails.
3. Both bundles carry the same key set; every key you added is used.
4. `git diff --stat` touches only your surface's files and its two bundles.
