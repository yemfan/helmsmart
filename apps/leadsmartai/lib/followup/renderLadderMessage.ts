/**
 * Fill {{name}}, {{city}} and {{brand}} in a ladder message.
 *
 * Anything left unreplaced is stripped rather than sent — "Hi {{name}}" reaching
 * a client is worse than the slightly clipped sentence you get without it.
 */
export function renderLadderMessage(
  template: string,
  vars: { name: string; city: string; brand: string },
): string {
  return template
    .replace(/\{\{name\}\}/g, vars.name)
    .replace(/\{\{city\}\}/g, vars.city)
    .replace(/\{\{brand\}\}/g, vars.brand)
    .replace(/\{\{\w+\}\}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
