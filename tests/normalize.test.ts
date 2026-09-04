import { describe, expect, it } from "vitest";
import { normalizeMatrix } from "../src/lib/normalize";
import { NrPrbError } from "../src/errors";
import type { ColumnMapping } from "../src/types";

const wideMapping: ColumnMapping = {
  format: "wide",
  timestampColumn: 0,
  timestampTimeColumn: null,
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

  it("combines separate date and time columns without local timezone drift", () => {
    const result = normalizeMatrix(
      [
        ["Date", "Time", "Cell Name", "UL.Interference.Avg.PRB0(dBm)"],
        ["2020-08-17", "14:05", "SYNTH_CELL_A", -102],
      ],
      {
        ...wideMapping,
        timestampColumn: 0,
        timestampTimeColumn: 1,
        cellColumn: 2,
        widePrbColumns: [{ columnIndex: 3, prbIndex: 0 }],
      },
    );
    expect(result.measurements[0]?.timestampLabel).toBe(
      "2020-08-17T14:05:00.000Z",
    );
  });

  it("treats NIL counters as missing instead of fabricating a floor value", () => {
    const result = normalizeMatrix(
      [
        ["timestamp", "cell_id", "PRB_0", "PRB_7"],
        ["2026-08-31T08:00:00Z", "SYNTH_CELL_A", -110, "NIL"],
      ],
      wideMapping,
    );
    expect(result.measurements).toHaveLength(1);
    expect(result.missingValueCount).toBe(1);
    expect(result.invalidValueCount).toBe(0);
    expect(result.measurements.some((item) => item.value === -125)).toBe(false);
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
    try {
      normalizeMatrix(
        [
          ["timestamp", "cell_id", "PRB_0", "PRB_7"],
          ["invalid", "CELL_A", -110, -90],
        ],
        wideMapping,
      );
      throw new Error("Expected normalization to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(NrPrbError);
      expect((error as NrPrbError).code).toBe("NO_VALID_MEASUREMENTS");
    }
  });
});
