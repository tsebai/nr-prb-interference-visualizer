import type { Measurement } from "../types";

export type DemoKind = "persistent" | "broadband" | "multicell";

function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function isoLabel(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

export function createDemoMeasurements(kind: DemoKind): Measurement[] {
  const start = Date.UTC(2026, 7, 31, 8, 0, 0);
  const periods = kind === "multicell" ? 36 : 48;
  const cells =
    kind === "multicell"
      ? ["SYNTH_CELL_A", "SYNTH_CELL_B", "SYNTH_CELL_C"]
      : ["SYNTH_CELL_A"];
  const measurements: Measurement[] = [];

  cells.forEach((cell, cellIndex) => {
    for (let period = 0; period < periods; period += 1) {
      const timestampMs = start + period * 5 * 60_000;
      for (let prb = 0; prb < 273; prb += 1) {
        const baseline =
          -114 + noise(period * 1_003 + prb * 37 + cellIndex * 503) * 7;
        let value = baseline;
        if (kind === "persistent" && [17, 18, 19, 101, 102, 221].includes(prb))
          value += 22;
        if (
          kind === "broadband" &&
          period >= 18 &&
          period <= 24 &&
          prb >= 58 &&
          prb <= 198
        )
          value += 18;
        if (kind === "multicell") {
          if (cellIndex === 0 && prb >= 30 && prb <= 36) value += 17;
          if (
            cellIndex === 1 &&
            period >= 12 &&
            period <= 18 &&
            prb >= 120 &&
            prb <= 190
          )
            value += 15;
          if (cellIndex === 2 && [8, 88, 188, 268].includes(prb)) value += 20;
        }
        if ((period * 273 + prb + cellIndex) % 997 === 0) continue;
        measurements.push({
          timestampMs,
          timestampLabel: isoLabel(timestampMs),
          periodOrder: period,
          cell,
          prb,
          value: Number(value.toFixed(2)),
        });
      }
    }
  });
  return measurements;
}
