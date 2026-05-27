import { readFileSync } from "node:fs";

const buf = readFileSync("c:/Users/Admin/Downloads/389118020560.txt");
const text = buf.toString("utf8");
const allRows = text
  .split("\n")
  .map((line) =>
    line.split("\t").map((c) => c.trim().replace(/"/g, "").replace(/'/g, "")),
  )
  .filter((l) => l.length > 1);

console.log("Total rows:", allRows.length);
console.log("Header len:", allRows[0].length);

const hdrSummary = allRows[0].map((c) =>
  String(c ?? "").toLowerCase().trim().replace(/['"]/g, ""),
);

const findCol = (...terms: string[]) => {
  for (const t of terms) {
    const i = hdrSummary.findIndex((h) => h.includes(t));
    if (i !== -1) return i;
  }
  return -1;
};

const iEnding = findCol("ending warehouse", "ending inventory", "ending balance");
const iUnknown = findCol("unknown events", "unknown");
const iFnsku = findCol("fnsku");
const iDate = findCol("date");
console.log("iEnding=", iEnding, "iUnknown=", iUnknown, "iFnsku=", iFnsku, "iDate=", iDate);
console.log("hdr[iEnding]=", hdrSummary[iEnding]);
console.log("hdr[iUnknown]=", hdrSummary[iUnknown]);

// Find sample row
for (let i = 1; i < allRows.length; i++) {
  if (allRows[i][iFnsku] === "X0050F02FT") {
    console.log("Found row date=", allRows[i][iDate]);
    console.log("  row.len=", allRows[i].length);
    console.log("  row[iEnding]=", JSON.stringify(allRows[i][iEnding]));
    console.log("  row[iUnknown]=", JSON.stringify(allRows[i][iUnknown]));
    break;
  }
}
