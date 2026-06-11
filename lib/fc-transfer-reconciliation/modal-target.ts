// Minimal shared input for the FC-transfer Raise-Case / Adjust modals.
//
// The modals are keyed by the msku|fnsku|asin grain for the case/adjustment
// write; they also show a small preview and seed default quantities. This neutral
// target lets the Full Reconciliation tab drive the modals without depending on
// any old analysis-tab row type.
export type FcModalTarget = {
  // identity — keyed for the case/adjustment write
  msku: string;
  fnsku: string;
  asin: string;
  title: string;

  // display / default-value fields the modals use (plain numbers; no coupling):
  //  - netQty seeds the default Units Claimed / Qty Adjusted (abs)
  //  - daysPending + imbalanceStart fill the preview box and notes default
  netQty: number;
  daysPending: number;
  imbalanceStart?: string;
};
