"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getMissingShipments,
  type MissingShipmentRow,
} from "@/actions/shipment-reconciliation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv, toCsv } from "@/lib/csv";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

function fmtNum(n: number | null): string {
  return n == null ? "—" : n.toLocaleString();
}

export function NewShipmentsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<MissingShipmentRow[] | null>(null);

  // Lazy fetch — only when the dialog opens. State updates run on the
  // microtask boundary (inside the async fn) to avoid synchronous setState
  // in the effect body.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setRows(null);
      try {
        const res = await getMissingShipments();
        if (!cancelled) setRows(res);
      } catch (e) {
        if (!cancelled) {
          toast.error(
            e instanceof Error ? e.message : "Failed to load new shipments.",
          );
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function onDownload() {
    if (!rows?.length) return;
    const headers = [
      "Shipment ID",
      "Status",
      "Ship To",
      "Store",
      "Total SKUs",
      "Units Expected",
      "Units Located",
      "Created Date",
    ];
    const body = rows.map((r) => [
      r.shipmentId,
      r.status ?? "—",
      r.shipTo ?? "—",
      r.store ?? "—",
      fmtNum(r.totalSkus),
      fmtNum(r.unitsExpected),
      fmtNum(r.unitsLocated),
      fmtDate(r.createdDate),
    ]);
    downloadCsv("new_shipments.csv", toCsv(headers, body));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[90vw] max-w-4xl overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>New Shipments</DialogTitle>
          <DialogDescription>
            Shipping Queue shipment IDs not found in your Shipped-to-FBA master —
            likely reports you forgot to upload.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : !rows || rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No missing shipments — every queued/received shipment is in your
              master.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shipment ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ship To</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">Total SKUs</TableHead>
                  <TableHead className="text-right">Units Exp.</TableHead>
                  <TableHead className="text-right">Units Loc.</TableHead>
                  <TableHead>Created Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.shipmentId}>
                    <TableCell className="font-medium">
                      {r.shipmentId}
                    </TableCell>
                    <TableCell>{r.status ?? "—"}</TableCell>
                    <TableCell>{r.shipTo ?? "—"}</TableCell>
                    <TableCell>{r.store ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {fmtNum(r.totalSkus)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtNum(r.unitsExpected)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtNum(r.unitsLocated)}
                    </TableCell>
                    <TableCell>{fmtDate(r.createdDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter showCloseButton>
          <Button
            variant="outline"
            size="sm"
            onClick={onDownload}
            disabled={!rows || rows.length === 0}
          >
            ⬇ Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
