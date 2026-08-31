import type { UnitMode } from "../types";

export function arithmeticMean(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function dbmMean(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const linearMean =
    values.reduce((sum, value) => sum + 10 ** (value / 10), 0) / values.length;
  return 10 * Math.log10(linearMean);
}

export function measurementMean(values: number[], unitMode: UnitMode): number {
  return unitMode === "dbm" ? dbmMean(values) : arithmeticMean(values);
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(0, Math.min(1, percentileValue)) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower] as number;
  const weight = rank - lower;
  return (
    (sorted[lower] as number) * (1 - weight) +
    (sorted[upper] as number) * weight
  );
}

export function p95(values: number[]): number {
  return percentile(values, 0.95);
}
