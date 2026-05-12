import {
  fetchDataExplorerTab,
  getDataExplorerFilterOptions,
  getDataExplorerStoreOptions,
  getDataExplorerSummary,
  getDataExplorerTabStats,
  type DataExplorerFilters,
} from "@/actions/data-explorer";
import { DataExplorerView } from "@/components/data-explorer/DataExplorerView";
import {
  type DataExplorerTabId,
  isDataExplorerTabId,
} from "@/lib/data-explorer-constants";

function parseParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function DataExplorerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const tabRaw = parseParam(sp, "tab") ?? "shipped_to_fba";
  const tab: DataExplorerTabId = isDataExplorerTabId(tabRaw)
    ? tabRaw
    : "shipped_to_fba";

  const pageRaw = Number.parseInt(parseParam(sp, "page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const ALLOWED_PAGE_SIZES = [20, 30, 50, 100] as const;
  const pageSizeRaw = Number.parseInt(parseParam(sp, "pageSize") ?? "", 10);
  const pageSize: number = (ALLOWED_PAGE_SIZES as readonly number[]).includes(
    pageSizeRaw,
  )
    ? pageSizeRaw
    : 20;

  const salesViewRaw = parseParam(sp, "salesView");
  const salesView: "fnsku" | "asin" =
    salesViewRaw === "asin" ? "asin" : "fnsku";

  const fbaViewRaw = parseParam(sp, "fbaView");
  const fbaView: "details" | "summary" =
    fbaViewRaw === "summary" ? "summary" : "details";

  const filters: DataExplorerFilters = {
    dateFrom: parseParam(sp, "from"),
    dateTo: parseParam(sp, "to"),
    store: parseParam(sp, "store"),
    search: parseParam(sp, "q"),
    shipmentId: parseParam(sp, "shipmentId"),
    msku: parseParam(sp, "msku"),
    fnsku: parseParam(sp, "fnsku"),
    disposition: parseParam(sp, "disposition"),
    fc: parseParam(sp, "fc"),
    reason: parseParam(sp, "reason"),
    orderStatus: parseParam(sp, "orderStatus"),
    fulfillmentCenter: parseParam(sp, "fulfillmentCenter"),
    shipmentStatus: parseParam(sp, "shipmentStatus"),
    settlementId: parseParam(sp, "settlementId"),
    transactionStatus: parseParam(sp, "transactionStatus"),
    unitStatus: parseParam(sp, "unitStatus"),
    flag: parseParam(sp, "flag"),
    adjStore: parseParam(sp, "adjStore"),
    salesView,
    fbaSummaryView: fbaView,
  };

  const [stores, stats, filterOptions, summary, result] = await Promise.all([
    getDataExplorerStoreOptions(),
    getDataExplorerTabStats(),
    getDataExplorerFilterOptions(),
    getDataExplorerSummary(tab, filters, {
      salesView,
      fbaSummaryView: fbaView,
    }),
    fetchDataExplorerTab(tab, filters, page, pageSize),
  ]);

  const rows = result.data as Record<string, unknown>[];

  return (
    <DataExplorerView
      tab={tab}
      page={result.page}
      pageSize={result.pageSize}
      total={result.total}
      filters={filters}
      salesView={salesView}
      fbaView={fbaView}
      stores={stores}
      filterOptions={filterOptions}
      counts={stats.counts}
      lastUploadedAt={stats.lastUploadedAt}
      summary={summary}
      rows={rows}
    />
  );
}
