import { describe, expect, it } from "vitest";
import { arithmeticMean, dbmMean, median, p95 } from "../src/lib/statistics";

describe("statistics", () => {
  it("uses linear power for the physically correct dBm mean", () => {
    const values = [-100, -90];
    expect(dbmMean(values)).toBeCloseTo(-92.596, 3);
    expect(dbmMean(values)).not.toBeCloseTo(arithmeticMean(values), 3);
  });

  it("uses an arithmetic mean for raw counters", () => {
    expect(arithmeticMean([10, 20, 60])).toBe(30);
  });

  it("calculates median and interpolated P95", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(p95([1, 2, 3, 4, 5])).toBeCloseTo(4.8, 8);
  });
});
