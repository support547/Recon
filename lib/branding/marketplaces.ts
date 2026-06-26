export const ALLOWED_MARKETPLACES = ["USA", "CA", "IN"] as const;
export type Marketplace = (typeof ALLOWED_MARKETPLACES)[number];

const AMAZON_DOMAINS: Record<Marketplace, string> = {
  USA: "www.amazon.com",
  CA: "www.amazon.ca",
  IN: "www.amazon.in",
};

/**
 * Returns the Amazon product detail page URL for an ASIN on the company's
 * marketplace. Returns null if marketplace is unset/invalid or ASIN is empty.
 * Never guesses — the caller renders plain text on null.
 */
export function amazonProductUrl(
  marketplace: Marketplace | null | undefined,
  asin: string | null | undefined,
): string | null {
  if (!marketplace) return null;
  if (!asin) return null;
  const trimmed = asin.trim();
  if (!trimmed) return null;
  const domain = AMAZON_DOMAINS[marketplace];
  if (!domain) return null;
  return `https://${domain}/dp/${trimmed}`;
}
