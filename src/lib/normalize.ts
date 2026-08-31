import type {
  CellValue,
  ColumnMapping,
  Measurement,
  NormalizationResult,
} from "../types";
import { normalizeHeader } from "./detect";
import { parseLocaleNumber } from "./csv";

const MAX_MEASUREMENTS = 2_000_000;

function safeCellLabel(value: CellValue): string {
  const label = String(value ?? "").trim();
  return label ? label.slice(0, 200) : "Unspecified cell";
}

function excelSerialToTimestamp(value: number): number | null {
  if (value <= 0 || value > 2_958_465) return null;
  const milliseconds = Date.UTC(1899, 11, 30) + value * 86_400_000;
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function parseTimestamp(
  value: CellValue,
): { milliseconds: number; label: string } | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return { milliseconds: value.getTime(), label: value.toISOString() };
  }
  if (typeof value === "number") {
    const milliseconds =
      value > 1_000_000_000_000
        ? value
        : value > 1_000_000_000
          ? value * 1000
          : excelSerialToTimestamp(value);
    if (milliseconds !== null && Number.isFinite(milliseconds)) {
      return { milliseconds, label: new Date(milliseconds).toISOString() };
    }
    return null;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const milliseconds = Date.parse(text);
  return Number.isFinite(milliseconds)
    ? { milliseconds, label: new Date(milliseconds).toISOString() }
    : null;
}

function pushMeasurement(
  measurements: Measurement[],
  measurement: Measurement,
): void {
  measurements.push(measurement);
  if (measurements.length > MAX_MEASUREMENTS) {
    throw new Error(
      `The file exceeds the ${MAX_MEASUREMENTS.toLocaleString()} measurement limit.`,
    );
  }
}

export function normalizeMatrix(
  matrix: CellValue[][],
  mapping: ColumnMapping,
): NormalizationResult {
  const headers = matrix[0] ?? [];
  const headerCounts = new Map<string, number>();
  headers.forEach((header) => {
    const normalized = normalizeHeader(header);
    if (normalized)
      headerCounts.set(normalized, (headerCounts.get(normalized) ?? 0) + 1);
  });
  const duplicateHeaderCount = [...headerCounts.values()].filter(
    (count) => count > 1,
  ).length;

  if (mapping.format === "wide" && mapping.widePrbColumns.length === 0) {
    throw new Error("No PRB columns are mapped for the wide format.");
  }
  if (
    mapping.format === "long" &&
    (mapping.prbColumn === null || mapping.valueColumn === null)
  ) {
    throw new Error("Map both the PRB index and interference value columns.");
  }

  const measurements: Measurement[] = [];
  let invalidTimestampCount = 0;
  let invalidValueCount = 0;
  let missingValueCount = 0;

  matrix.slice(1).forEach((row, dataIndex) => {
    const periodOrder = dataIndex;
    let timestampMs: number | null = null;
    let timestampLabel =
      mapping.timestampColumn === null ? `Snapshot ${dataIndex + 1}` : "";
    if (mapping.timestampColumn !== null) {
      const rawTimestamp = row[mapping.timestampColumn] ?? null;
      const parsedTimestamp = parseTimestamp(rawTimestamp);
      if (!parsedTimestamp) {
        invalidTimestampCount += 1;
        return;
      }
      timestampMs = parsedTimestamp.milliseconds;
      timestampLabel = parsedTimestamp.label;
    } else if (mapping.format === "long") {
      timestampLabel = "Snapshot 1";
    }

    const cell =
      mapping.cellColumn === null
        ? "Unspecified cell"
        : safeCellLabel(row[mapping.cellColumn] ?? null);

    if (mapping.format === "wide") {
      mapping.widePrbColumns.forEach(({ columnIndex, prbIndex }) => {
        const rawValue = row[columnIndex] ?? null;
        const parsedValue = parseLocaleNumber(rawValue, mapping.decimalMode);
        if (parsedValue === null) {
          const rawText = String(rawValue ?? "").trim();
          if (rawText === "" || /^(?:na|n\/a|null|none|-)$/i.test(rawText))
            missingValueCount += 1;
          else invalidValueCount += 1;
          return;
        }
        pushMeasurement(measurements, {
          timestampMs,
          timestampLabel,
          periodOrder,
          cell,
          prb: prbIndex,
          value: parsedValue,
        });
      });
      return;
    }

    const rawPrb = row[mapping.prbColumn as number] ?? null;
    const prbValue = parseLocaleNumber(rawPrb, "point");
    if (
      prbValue === null ||
      !Number.isSafeInteger(prbValue) ||
      prbValue < 0 ||
      prbValue > 100_000
    ) {
      invalidValueCount += 1;
      return;
    }
    const rawValue = row[mapping.valueColumn as number] ?? null;
    const parsedValue = parseLocaleNumber(rawValue, mapping.decimalMode);
    if (parsedValue === null) {
      const rawText = String(rawValue ?? "").trim();
      if (rawText === "" || /^(?:na|n\/a|null|none|-)$/i.test(rawText))
        missingValueCount += 1;
      else invalidValueCount += 1;
      return;
    }
    pushMeasurement(measurements, {
      timestampMs,
      timestampLabel,
      periodOrder: mapping.timestampColumn === null ? 0 : periodOrder,
      cell,
      prb: prbValue,
      value: parsedValue,
    });
  });

  if (measurements.length === 0) {
    throw new Error(
      "No valid PRB measurements were found with the selected mapping.",
    );
  }

  const warnings: string[] = [];
  if (invalidTimestampCount > 0)
    warnings.push(
      `${invalidTimestampCount} row(s) with invalid timestamps were skipped.`,
    );
  if (invalidValueCount > 0)
    warnings.push(
      `${invalidValueCount} invalid numeric value(s) were skipped.`,
    );
  if (duplicateHeaderCount > 0)
    warnings.push(
      `${duplicateHeaderCount} duplicate header name(s) were detected.`,
    );

  return {
    measurements,
    invalidTimestampCount,
    invalidValueCount,
    missingValueCount,
    duplicateHeaderCount,
    sourceRowCount: Math.max(0, matrix.length - 1),
    warnings,
  };
}
