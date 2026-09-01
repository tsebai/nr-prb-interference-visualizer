import type {
  AggregatedPoint,
  AnalysisOptions,
  AnalysisResult,
  Measurement,
  PeriodProfile,
  PeriodSummary,
  PrbSummary,
} from "../types";
import { measurementMean, median, p95 } from "./statistics";

function periodKey(
  timestampMs: number | null,
  periodOrder: number,
  label: string,
): string {
  return timestampMs === null
    ? `snapshot:${periodOrder}:${label}`
    : `time:${timestampMs}`;
}

function formatTimestamp(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(".000Z", "Z");
}

export function aggregateMeasurements(
  measurements: Measurement[],
  options: AnalysisOptions,
): AggregatedPoint[] {
  const groups = new Map<
    string,
    {
      timestampMs: number | null;
      timestampLabel: string;
      periodOrder: number;
      cell: string;
      prb: number;
      values: number[];
    }
  >();

  measurements.forEach((measurement) => {
    if (measurement.timestampMs !== null) {
      if (options.startMs !== null && measurement.timestampMs < options.startMs)
        return;
      if (options.endMs !== null && measurement.timestampMs > options.endMs)
        return;
    }
    const bucket =
      measurement.timestampMs !== null && options.intervalMs > 0
        ? Math.floor(measurement.timestampMs / options.intervalMs) *
          options.intervalMs
        : measurement.timestampMs;
    const label =
      bucket === null ? measurement.timestampLabel : formatTimestamp(bucket);
    const order = bucket === null ? measurement.periodOrder : bucket;
    const key = JSON.stringify([
      measurement.cell,
      measurement.prb,
      bucket,
      bucket === null ? order : 0,
      label,
    ]);
    const existing = groups.get(key);
    if (existing) {
      existing.values.push(measurement.value);
    } else {
      groups.set(key, {
        timestampMs: bucket,
        timestampLabel: label,
        periodOrder: order,
        cell: measurement.cell,
        prb: measurement.prb,
        values: [measurement.value],
      });
    }
  });

  return [...groups.values()].map((group) => ({
    timestampMs: group.timestampMs,
    timestampLabel: group.timestampLabel,
    periodOrder: group.periodOrder,
    cell: group.cell,
    prb: group.prb,
    value: measurementMean(group.values, options.unitMode),
    samples: group.values.length,
  }));
}

function sortPeriods(left: PeriodSummary, right: PeriodSummary): number {
  if (left.timestampMs !== null && right.timestampMs !== null)
    return left.timestampMs - right.timestampMs;
  if (left.timestampMs !== null) return -1;
  if (right.timestampMs !== null) return 1;
  return left.order - right.order;
}

export function buildAnalysis(
  points: AggregatedPoint[],
  selectedCell: string,
  options: AnalysisOptions,
  availableCells?: string[],
): AnalysisResult {
  const cells = (
    availableCells ?? [...new Set(points.map((point) => point.cell))]
  )
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right));
  const cell = cells.includes(selectedCell)
    ? selectedCell
    : (cells[0] ?? "Unspecified cell");
  const filtered = points.filter((point) => point.cell === cell);
  const prbs = [...new Set(filtered.map((point) => point.prb))].sort(
    (left, right) => left - right,
  );

  const periodMap = new Map<string, PeriodSummary>();
  filtered.forEach((point) => {
    const key = periodKey(
      point.timestampMs,
      point.periodOrder,
      point.timestampLabel,
    );
    periodMap.set(key, {
      key,
      timestampMs: point.timestampMs,
      label: point.timestampLabel,
      order: point.periodOrder,
    });
  });
  const periods = [...periodMap.values()].sort(sortPeriods);

  const values = new Map<string, number>();
  const byPrb = new Map<number, number[]>();
  const byPeriod = new Map<string, number[]>();
  filtered.forEach((point) => {
    const pointPeriodKey = periodKey(
      point.timestampMs,
      point.periodOrder,
      point.timestampLabel,
    );
    const key = `${pointPeriodKey}|${point.prb}`;
    values.set(key, point.value);
    const list = byPrb.get(point.prb) ?? [];
    list.push(point.value);
    byPrb.set(point.prb, list);
    const periodValues = byPeriod.get(pointPeriodKey) ?? [];
    periodValues.push(point.value);
    byPeriod.set(pointPeriodKey, periodValues);
  });

  const summaries: PrbSummary[] = prbs.map((prb) => {
    const prbValues = byPrb.get(prb) ?? [];
    const threshold = options.threshold;
    const thresholdHits =
      threshold === null
        ? null
        : prbValues.filter((value) =>
            options.higherMeansMore ? value >= threshold : value <= threshold,
          ).length;
    return {
      prb,
      mean: measurementMean(prbValues, options.unitMode),
      median: median(prbValues),
      maximum: Math.max(...prbValues),
      p95: p95(prbValues),
      thresholdPercent:
        thresholdHits === null
          ? null
          : (thresholdHits / prbValues.length) * 100,
      samples: prbValues.length,
    };
  });

  const periodProfiles: PeriodProfile[] = periods.map((period) => {
    const periodValues = byPeriod.get(period.key) ?? [];
    return {
      period,
      minimum: Math.min(...periodValues),
      mean: measurementMean(periodValues, options.unitMode),
      maximum: Math.max(...periodValues),
      p95: p95(periodValues),
      samples: periodValues.length,
    };
  });

  const allValues = filtered.map((point) => point.value);
  const timestamps = periods.filter((period) => period.timestampMs !== null);
  return {
    cell,
    cells,
    prbs,
    periods,
    values,
    summaries,
    periodProfiles,
    missingValues: Math.max(0, periods.length * prbs.length - filtered.length),
    rangeStart: timestamps[0]?.label ?? periods[0]?.label ?? "Not available",
    rangeEnd:
      timestamps.at(-1)?.label ?? periods.at(-1)?.label ?? "Not available",
    scaleMin: allValues.length > 0 ? Math.min(...allValues) : 0,
    scaleMax: allValues.length > 0 ? Math.max(...allValues) : 1,
  };
}
