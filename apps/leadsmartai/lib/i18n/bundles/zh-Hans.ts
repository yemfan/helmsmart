/**
 * Every Simplified Chinese bundle, for the server.
 *
 * `lib/i18n/translator.ts` resolves any key in any namespace, so the server
 * needs the whole map — it never sees the route-group split, which exists to
 * keep the BROWSER from downloading namespaces its page cannot use.
 *
 * The two group modules cover everything a CLIENT component reads. The few
 * below are rendered only on the server, so no group carries them.
 */
import app from "./zh-Hans.app";
import web from "./zh-Hans.web";
import zhWebAgentPricing from "@leadsmart/i18n/locale/zh-Hans/web_agent_pricing";
import zhWebPricing from "@leadsmart/i18n/locale/zh-Hans/web_pricing";

// `app` last, deliberately: the web group maps `dashboard` to a TRIMMED slice
// of that namespace, and the server must translate from the whole thing.
const bundle: Record<string, Record<string, unknown>> = {
  ...web,
  ...app,
  web_agent_pricing: zhWebAgentPricing,
  web_pricing: zhWebPricing,
};

export default bundle;
