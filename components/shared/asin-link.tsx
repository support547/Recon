import * as React from "react";

import {
  amazonProductUrl,
  type Marketplace,
} from "@/lib/branding/marketplaces";

/**
 * Renders ASIN as an anchor to the Amazon product page on the company's
 * marketplace, or plain text when marketplace is unset or ASIN is empty.
 * Inherits font styling from the surrounding TableCell.
 */
export function AsinLink({
  asin,
  marketplace,
}: {
  asin: string | null | undefined;
  marketplace: Marketplace | null | undefined;
}) {
  const url = amazonProductUrl(marketplace, asin);
  if (!url) return <>{asin || "—"}</>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-700 hover:underline"
    >
      {asin}
    </a>
  );
}
