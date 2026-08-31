import { describe, expect, it } from "vitest";
import { normalizeMatrix } from "../src/lib/normalize";
import type { ColumnMapping } from "../src/types";

const wideMapping: ColumnMapping = {
  format: "wide",
  timestampColumn: 0,
  cellColumn: 1,
  prbColumn: null,
  valueColumn: null,
  widePrbColumns: [
    { columnIndex: 2, prbIndex: 0 },
    { columnIndex: 3, prbIndex: 7 },
  ],
  decimalMode: "auto",
};

describe("normalization", () => {
  it("normalizes wide data with non-contiguous PRBs and missing values", () => {
    const result = normalizeMatrix(
      [
        ["timestamp", "cell_id", "PRB_0", "PRB_7"],
        ["2026-08-31T08:00:00Z", "CELL_A", "-110,5", ""],
        ["2026-08-31T08:05:00Z", "CELL_A", -109, -91],
      ],
      wideMapping,
    );
    expect(result.measurements).toHaveLength(3);
    expect(result.measurements.map((item) => item.prb)).toEqual([0, 0, 7]);
    expect(result.missingValueCount).toBe(1);
  });

  it("normalizes long data with multiple cells", () => {
    const result = normalizeMatrix(
      [
        ["timestamp", "cell_id", "prb", "interference"],
        ["2026-08-31T08:00:00Z", "CELL_A", 0, -112],
        ["2026-08-31T08:00:00Z", "CELL_B", 0, -97],
      ],
      {
        ...wideMapping,
        format: "long",
        prbColumn: 2,
        valueColumn: 3,
        widePrbColumns: [],
      },
    );
    expect(result.measurements.map((item) => item.cell)).toEqual([
      "CELL_A",
      "CELL_B",
    ]);
  });

  it("accepts a single snapshot without timestamp", () => {
    const result = normalizeMatrix(
      [
        ["0", "1", "2"],
        [-110, -100, -90],
      ],
      {
        ...wideMapping,
        timestampColumn: null,
        cellColumn: null,
        widePrbColumns: [
          { columnIndex: 0, prbIndex: 0 },
          { columnIndex: 1, prbIndex: 1 },
          { columnIndex: 2, prbIndex: 2 },
        ],
      },
    );
    expect(result.measurements).toHaveLength(3);
    expect(result.measurements[0]?.timestampLabel).toBe("Snapshot 1");
  });

  it("skips invalid timestamps and rejects files with no valid values", () => {
    expect(() =>
      normalizeMatrix(
        [
          ["timestamp", "cell_id", "PRB_0", "PRB_7"],
          ["invalid", "CELL_A", -110, -90],
        ],
        wideMapping,
      ),
    ).toThrow("No valid PRB measurements");
  });
});
