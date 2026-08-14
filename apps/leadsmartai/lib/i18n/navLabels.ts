import type { NavSection } from "@repo/ui";

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
 * untouched, so nothing about routing or role filtering depends on locale.
 */
export function translateNavSections(
  sections: NavSection[],
  translate: (label: string) => string,
): NavSection[] {
  return sections.map((section) => {
    if (!("label" in section)) return section; // dividers carry no copy
    const next = { ...section, label: translate(section.label) };
    if ("items" in section && Array.isArray(section.items)) {
      return {
        ...next,
        items: section.items.map((item) => ({ ...item, label: translate(item.label) })),
      } as NavSection;
    }
    return next as NavSection;
  });
}
