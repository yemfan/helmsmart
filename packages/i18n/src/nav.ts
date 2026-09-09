/**
 * Translate an authored nav tree.
 *
 * Nav configs are authored in English, and each app's nav namespace is keyed
 * by those same English strings. That keeps the config readable and means a
 * newly added nav entry still renders — it just falls back to its own label
 * until a translation lands, rather than showing a raw `nav.foo.bar` key.
 *
 * Only labels change; hrefs, icons, roles and match rules pass through
 * untouched, so nothing about routing or role filtering depends on locale.
 *
 * Generic over the tree shape: CloseBoss's `NavSection` union (dividers,
 * section labels, groups) and HelmSmart's `{ label?, items }` both fit.
 */
type Labelled = { label?: string };
type WithItems = { items?: readonly Labelled[] };

export function translateNavSections<T extends Labelled & WithItems | object>(
  sections: readonly T[],
  translate: (label: string) => string,
): T[] {
  return sections.map((section) => {
    if (!("label" in section) && !("items" in section)) return section; // dividers carry no copy
    const next: Labelled & WithItems = { ...(section as Labelled & WithItems) };
    if (typeof next.label === "string") next.label = translate(next.label);
    if (Array.isArray(next.items)) {
      next.items = next.items.map((item) =>
        typeof item.label === "string" ? { ...item, label: translate(item.label) } : item,
      );
    }
    return next as T;
  });
}
