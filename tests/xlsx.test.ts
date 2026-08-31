import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import readXlsxFile from "read-excel-file/node";
import { detectMapping } from "../src/lib/detect";
import { normalizeMatrix } from "../src/lib/normalize";

const root = fileURLToPath(new URL("..", import.meta.url));
const sample = path.join(root, "samples", "synthetic-prb-examples.xlsx");

describe("XLSX parsing", () => {
  beforeAll(async () => {
    const { spawn } = await import("node:child_process");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["scripts/generate-samples.mjs"], {
        cwd: root,
        stdio: "ignore",
      });
      child.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("Sample generation failed.")),
      );
    });
  });

  it("reads both wide and long worksheets", async () => {
    const sheets = await readXlsxFile(sample);
    expect(sheets.map((sheet) => sheet.sheet)).toEqual([
      "Wide 273 PRBs",
      "Long multi-cell",
    ]);
    const wideSheet = sheets[0];
    expect(wideSheet).toBeDefined();
    if (!wideSheet) throw new Error("The wide sample sheet is missing.");
    const wide =
      wideSheet.data as unknown as import("../src/types").CellValue[][];
    const suggestion = detectMapping(wide[0] ?? []);
    expect(suggestion.widePrbColumns).toHaveLength(273);
    const normalized = normalizeMatrix(wide, {
      ...suggestion,
      decimalMode: "auto",
    });
    expect(normalized.measurements.length).toBeGreaterThan(5_000);
  });
});
