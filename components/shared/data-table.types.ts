import type { RowData } from "@tanstack/react-table";

export type ErpCellRole = "mono" | "amount" | "qty" | "default";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Controls ERP table cell typography (mono / amount / qty). */
    cellRole?: ErpCellRole;
  }
}
