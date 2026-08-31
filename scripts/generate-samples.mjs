import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import writeExcelFile from "write-excel-file/node";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const samplesDirectory = path.join(root, "samples");
fs.mkdirSync(samplesDirectory, { recursive: true });

function noise(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function valueFor(period, prb, variant, cellIndex = 0) {
  let value = -114 + noise(period * 1009 + prb * 37 + cellIndex * 503) * 7;
  if (variant === "persistent" && [17, 18, 19, 101, 102, 221].includes(prb))
    value += 22;
  if (
    variant === "broadband" &&
    period >= 15 &&
    period <= 21 &&
    prb >= 58 &&
    prb <= 198
  )
    value += 18;
  if (variant === "multicell") {
    if (cellIndex === 0 && prb >= 30 && prb <= 36) value += 17;
    if (
      cellIndex === 1 &&
      period >= 8 &&
      period <= 14 &&
      prb >= 120 &&
      prb <= 190
    )
      value += 15;
    if (cellIndex === 2 && [8, 88, 188, 268].includes(prb)) value += 20;
  }
  return Number(value.toFixed(2));
}

function timestamp(period) {
  return new Date(
    Date.UTC(2026, 7, 31, 8, 0, 0) + period * 5 * 60_000,
  ).toISOString();
}

function csvCell(value, delimiter = ",") {
  const text = String(value);
  return text.includes(delimiter) || /["\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

const prbHeaders = Array.from({ length: 273 }, (_, prb) => `PRB_${prb}`);
const persistentRows = [["timestamp", "cell_id", ...prbHeaders]];
for (let period = 0; period < 48; period += 1) {
  persistentRows.push([
    timestamp(period),
    "SYNTH_CELL_A",
    ...Array.from({ length: 273 }, (_, prb) =>
      valueFor(period, prb, "persistent"),
    ),
  ]);
}
fs.writeFileSync(
  path.join(samplesDirectory, "persistent-273-prb.csv"),
  persistentRows
    .map((row) => row.map((value) => csvCell(value)).join(","))
    .join("\r\n"),
  "utf8",
);

const broadbandRows = [["timestamp", "cell_id", ...prbHeaders]];
for (let period = 0; period < 42; period += 1) {
  broadbandRows.push([
    timestamp(period),
    "SYNTH_CELL_A",
    ...Array.from({ length: 273 }, (_, prb) =>
      String(valueFor(period, prb, "broadband")).replace(".", ","),
    ),
  ]);
}
fs.writeFileSync(
  path.join(samplesDirectory, "temporary-broadband-273-prb.csv"),
  broadbandRows
    .map((row) => row.map((value) => csvCell(value, ";")).join(";"))
    .join("\r\n"),
  "utf8",
);

const longRows = [["timestamp", "cell_id", "prb", "interference"]];
["SYNTH_CELL_A", "SYNTH_CELL_B", "SYNTH_CELL_C"].forEach((cell, cellIndex) => {
  for (let period = 0; period < 24; period += 1) {
    for (let prb = 0; prb < 273; prb += 1) {
      longRows.push([
        timestamp(period),
        cell,
        prb,
        valueFor(period, prb, "multicell", cellIndex),
      ]);
    }
  }
});
fs.writeFileSync(
  path.join(samplesDirectory, "multi-cell-long.csv"),
  longRows
    .map((row) => row.map((value) => csvCell(value)).join(","))
    .join("\r\n"),
  "utf8",
);

const controlledErrors = [
  ["timestamp", "cell_id", "PRB_0", "PRB_2", "PRB_7"],
  ["2026-08-31T08:00:00Z", "SYNTH_CELL_A", -111.2, "", -92.4],
  ["invalid timestamp", "SYNTH_CELL_A", -110.8, -105.1, -93.0],
  ["2026-08-31T08:10:00Z", "SYNTH_CELL_A", "not-a-number", -104.8, -92.1],
  ["2026-08-31T08:15:00Z", "SYNTH_CELL_A", -112.0, -104.5, -91.8],
];
fs.writeFileSync(
  path.join(samplesDirectory, "controlled-missing-and-errors.csv"),
  controlledErrors
    .map((row) => row.map((value) => csvCell(value)).join(","))
    .join("\r\n"),
  "utf8",
);

const xlsxWideRows = persistentRows.slice(0, 25);
const xlsxLongRows = [["timestamp", "cell_id", "prb", "interference"]];
["SYNTH_CELL_A", "SYNTH_CELL_B", "SYNTH_CELL_C"].forEach((cell, cellIndex) => {
  for (let prb = 0; prb < 273; prb += 1) {
    xlsxLongRows.push([
      timestamp(0),
      cell,
      prb,
      valueFor(0, prb, "multicell", cellIndex),
    ]);
  }
});
await writeExcelFile([
  { data: xlsxWideRows, sheet: "Wide 273 PRBs", stickyRowsCount: 1 },
  { data: xlsxLongRows, sheet: "Long multi-cell", stickyRowsCount: 1 },
]).toFile(path.join(samplesDirectory, "synthetic-prb-examples.xlsx"));

process.stdout.write("Synthetic sample files generated.\n");
