import { describe, expect, it } from "vitest";
import { aggregateMeasurements, buildAnalysis } from "../src/lib/analysis";
import type { AnalysisOptions, Measurement } from "../src/types";

const measurements: Measurement[] = [
  {
    timestampMs: 1_000,
    timestampLabel: "A",
    periodOrder: 0,
    cell: "CELL_A",
    prb: 0,
    value: -100,
  },
  {
    timestampMs: 1_000,
    timestampLabel: "A",
    periodOrder: 0,
    cell: "CELL_A",
    prb: 0,
    value: -90,
  },
  {
    timestampMs: 2_000,
    timestampLabel: "B",
    periodOrder: 1,
    cell: "CELL_A",
    prb: 0,
    value: -80,
  },
  {
    timestampMs: 1_000,
    timestampLabel: "A",
    periodOrder: 0,
    cell: "CELL_B",
    prb: 2,
    value: -95,
  },
];

function options(unitMode: AnalysisOptions["unitMode"]): AnalysisOptions {
  return {
    unitMode,
    higherMeansMore: true,
    threshold: -85,
    intervalMs: 0,
    startMs: null,
    endMs: null,
  };
}

describe("analysis", () => {
  it("deduplicates dBm samples using linear power averaging", () => {
    const points = aggregateMeasurements(measurements, options("dbm"));
    expect(
      points.find(
        (point) => point.cell === "CELL_A" && point.timestampMs === 1_000,
      )?.value,
    ).toBeCloseTo(-92.596, 3);
  });

  it("uses arithmetic averaging for raw counters", () => {
    const points = aggregateMeasurements(measurements, options("raw"));
    expect(
      points.find(
        (point) => point.cell === "CELL_A" && point.timestampMs === 1_000,
      )?.value,
    ).toBe(-95);
  });

  it("builds cell-specific summaries and threshold percentages", () => {
    const analysis = buildAnalysis(
      aggregateMeasurements(measurements, options("dbm")),
      "CELL_A",
      options("dbm"),
    );
    expect(analysis.cells).toEqual(["CELL_A", "CELL_B"]);
    expect(analysis.prbs).toEqual([0]);
    expect(analysis.periods).toHaveLength(2);
    expect(analysis.summaries[0]?.thresholdPercent).toBe(50);
  });

  it("builds a time profile with a physically correct dBm mean across PRBs", () => {
    const periodMeasurements: Measurement[] = [
      {
        timestampMs: 1_000,
        timestampLabel: "A",
        periodOrder: 0,
        cell: "CELL_A",
        prb: 0,
        value: -100,
      },
      {
        timestampMs: 1_000,
        timestampLabel: "A",
        periodOrder: 0,
        cell: "CELL_A",
        prb: 1,
        value: -110,
      },
    ];
    const analysis = buildAnalysis(
      aggregateMeasurements(periodMeasurements, options("dbm")),
      "CELL_A",
      options("dbm"),
    );
    expect(analysis.periodProfiles).toHaveLength(1);
    expect(analysis.periodProfiles[0]?.minimum).toBe(-110);
    expect(analysis.periodProfiles[0]?.mean).toBeCloseTo(-102.596, 3);
    expect(analysis.periodProfiles[0]?.mean).not.toBe(-105);
    expect(analysis.periodProfiles[0]?.maximum).toBe(-100);
  });
});
