import { readFileSync } from "node:fs";

const buf = readFileSync("c:/Users/Admin/Downloads/396315020599.txt");
const text = buf.toString("utf8");
const lines = text.split("\n");
const hdr = lines[0].split("\t").map((c) => c.trim().replace(/"/g, "").replace(/'/g, ""));
console.log("HDR len:", hdr.length);
hdr.forEach((h, i) => console.log(i, JSON.stringify(h)));

const hdrLower = hdr.map((s) => s.toLowerCase().trim().replace(/['"]/g, ""));
const findCol = (...terms: string[]) => {
  for (const t of terms) {
    const i = hdrLower.findIndex((h) => h.includes(t));
    if (i !== -1) return i;
  }
  return -1;
};
console.log("iEnding=", findCol("ending warehouse", "ending inventory", "ending balance"));
console.log("iUnknown=", findCol("unknown events", "unknown"));

// row for X0050F02FT 05/19/2026
const row = lines.find((l) => l.includes("X0050F02FT") && l.includes("05/19/2026"));
if (row) {
  const cells = row.split("\t").map((c) => c.trim().replace(/"/g, "").replace(/'/g, ""));
  console.log("Row len:", cells.length);
  cells.forEach((c, i) => console.log(i, JSON.stringify(c)));
}
