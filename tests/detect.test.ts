import { describe, expect, it } from "vitest";
import { detectMapping, detectPrbIndex } from "../src/lib/detect";

describe("format and PRB column detection", () => {
  it.each([
    ["PRB_0", 0],
    ["PRB0", 0],
    ["RB_17", 17],
    ["RB221", 221],
    ["UL.Interference.Avg.PRB0(dBm)", 0],
    ["PM_UL_RB-99_LEVEL", 99],
    ["272", 272],
    ["timestamp", null],
  ])("detects %s", (header, expected) => {
    expect(detectPrbIndex(header)).toBe(expected);
  });

  it("detects a dynamic wide layout", () => {
    const mapping = detectMapping([
      "timestamp",
      "cell_id",
      "PRB_0",
      "RB1",
      "7",
    ]);
    expect(mapping.format).toBe("wide");
    expect(mapping.widePrbColumns.map((item) => item.prbIndex)).toEqual([
      0, 1, 7,
    ]);
  });

  it("detects a long layout", () => {
    const mapping = detectMapping(["datetime", "nci", "prb", "interference"]);
    expect(mapping.format).toBe("long");
    expect(mapping.prbColumn).toBe(2);
    expect(mapping.valueColumn).toBe(3);
    expect(mapping.cellColumn).toBe(1);
  });

  it("maps separate OSS date and time columns, the exact cell name, and prefixed PRBs", () => {
    const mapping = detectMapping([
      "Date",
      "Time",
      "Cell FDD TDD Indication",
      "Cell Name",
      "LocalCell Id",
      "UL.Interference.Avg.PRB0(dBm)",
      "UL.Interference.Avg.PRB49(dBm)",
    ]);
    expect(mapping.format).toBe("wide");
    expect(mapping.timestampColumn).toBe(0);
    expect(mapping.timestampTimeColumn).toBe(1);
    expect(mapping.cellColumn).toBe(3);
    expect(mapping.widePrbColumns).toEqual([
      { columnIndex: 5, prbIndex: 0 },
      { columnIndex: 6, prbIndex: 49 },
    ]);
  });
});
