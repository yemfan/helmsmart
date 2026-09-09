import type { NavSection } from "@repo/ui";

import { translateNavSections as translateTree } from "@leadsmart/i18n";

/**
 * Translate an authored nav tree.
 *
 * The nav configs (`nav.config.tsx`, `brokerNav.config.tsx`) are authored in
 * English, and the `dashboard_nav` namespace is keyed by those same English
 * strings. That keeps the config readable and means a newly added nav entry
 * still renders — it just falls back to its own label until a translation
 * lands, rather than showing a raw `nav.foo.bar` key.
 *
 * Only labels change; hrefs, icons, roles and match rules pass through
 * untouched. The walk itself is the package's, shared with HelmSmart; this
 * wrapper pins CloseBoss's `NavSection` union onto it.
 */
export function translateNavSections(
  sections: NavSection[],
  translate: (label: string) => string,
): NavSection[] {
  return translateTree(sections, translate);
}
