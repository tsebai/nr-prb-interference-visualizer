import { describe, expect, it } from "vitest";
import { detectMapping, detectPrbIndex } from "../src/lib/detect";

describe("format and PRB column detection", () => {
  it.each([
    ["PRB_0", 0],
    ["PRB0", 0],
    ["RB_17", 17],
    ["RB221", 221],
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
});
