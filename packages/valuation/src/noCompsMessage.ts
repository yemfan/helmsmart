/**
 * What to say when a CMA search came back without usable comps.
 *
 * This used to be one fixed sentence ending "Try a more complete address
 * (include city, state, and ZIP)" — printed even when the agent had typed all
 * three. Being told to supply what you just supplied reads as the product not
 * having looked, and it sends the reader off to re-type an address that was
 * already correct instead of to the one action that helps.
 *
 * So the advice is only offered when it applies. When the address is already
 * fully qualified, the honest answer is that nothing came back for it.
 *
 * Kept in its own module with no imports so it can be unit-tested without
 * pulling in the Anthropic client and the `server-only` guard that `aiCma.ts`
 * carries.
 */
export function noCompsMessage(address: string): string {
  const a = (address ?? "").trim();
  const hasZip = /\b\d{5}(?:-\d{4})?\b/.test(a);
  const hasState = hasStateCode(a);
  /** "123 Main St, Chicago" — a street part plus at least one more. */
  const hasCity = a.split(",").filter((part) => part.trim()).length >= 2;

  if (hasZip && hasState && hasCity) {
    return (
      "We couldn't find recent comparable sales for this address, so there's " +
      "nothing solid to base a valuation on. That usually means the area has " +
      "had few recent sales. You can try again later, or enter the value " +
      "manually to build the report around your own number."
    );
  }

  const missing: string[] = [];
  if (!hasCity) missing.push("city");
  if (!hasState) missing.push("state");
  if (!hasZip) missing.push("ZIP");
  return (
    "We couldn't find recent comparable sales for this address. The address " +
    `is missing the ${joinList(missing)} — adding that usually narrows the ` +
    "search enough to find real comps."
  );
}

const STATE_CODES = new Set(
  ("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN " +
    "MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA " +
    "WV WI WY PR VI GU AS MP").split(" "),
);

/**
 * Whether the address carries a US state.
 *
 * Matched against the real list rather than "any two letters in the right
 * position", because a street suffix sits in exactly that position: `123 Main
 * St` ends in two letters preceded by a space, and a positional regex reads
 * that as a state and then tells the agent their complete-looking address is
 * complete when it has no state at all.
 */
function hasStateCode(address: string): boolean {
  return address
    .split(/[\s,]+/)
    .some((token) => STATE_CODES.has(token.toUpperCase()));
}

/** "city, state and ZIP" — a list for a sentence, not for a table. */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
