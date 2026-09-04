import type {
  CellValue,
  ColumnMapping,
  Measurement,
  NormalizationResult,
} from "../types";
import { normalizeHeader } from "./detect";
import { parseLocaleNumber } from "./csv";
import { NrPrbError } from "../errors";

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
  const unzonedIso =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      text,
    );
  if (unzonedIso) {
    const milliseconds = Date.UTC(
      Number(unzonedIso[1]),
      Number(unzonedIso[2]) - 1,
      Number(unzonedIso[3]),
      Number(unzonedIso[4]),
      Number(unzonedIso[5]),
      Number(unzonedIso[6] ?? 0),
      Number((unzonedIso[7] ?? "0").padEnd(3, "0")),
    );
    if (Number.isFinite(milliseconds)) {
      return { milliseconds, label: new Date(milliseconds).toISOString() };
    }
  }
  const milliseconds = Date.parse(text);
  return Number.isFinite(milliseconds)
    ? { milliseconds, label: new Date(milliseconds).toISOString() }
    : null;
}

function excelTimeFraction(value: number): string | null {
  if (!Number.isFinite(value) || value < 0 || value >= 1) return null;
  const totalSeconds = Math.round(value * 86_400) % 86_400;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function parseTimestampParts(
  dateValue: CellValue,
  timeValue: CellValue,
): { milliseconds: number; label: string } | null {
  const timeText =
    typeof timeValue === "number"
      ? excelTimeFraction(timeValue)
      : timeValue instanceof Date
        ? timeValue.toISOString().slice(11, 23)
        : String(timeValue ?? "").trim();
  if (!timeText) return parseTimestamp(dateValue);

  if (typeof dateValue === "number" && typeof timeValue === "number") {
    return parseTimestamp(dateValue + timeValue);
  }
  const dateText =
    dateValue instanceof Date
      ? dateValue.toISOString().slice(0, 10)
      : String(dateValue ?? "").trim();
  if (!dateText) return parseTimestamp(timeValue);
  return parseTimestamp(`${dateText} ${timeText}`);
}

function pushMeasurement(
  measurements: Measurement[],
  measurement: Measurement,
): void {
  measurements.push(measurement);
  if (measurements.length > MAX_MEASUREMENTS) {
    throw new NrPrbError("MEASUREMENT_LIMIT");
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
    throw new NrPrbError("WIDE_PRB_MAPPING_REQUIRED");
  }
  if (
    mapping.format === "long" &&
    (mapping.prbColumn === null || mapping.valueColumn === null)
  ) {
    throw new NrPrbError("LONG_MAPPING_REQUIRED");
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
      const rawTime =
        mapping.timestampTimeColumn !== null &&
        mapping.timestampTimeColumn !== mapping.timestampColumn
          ? (row[mapping.timestampTimeColumn] ?? null)
          : null;
      const parsedTimestamp = parseTimestampParts(rawTimestamp, rawTime);
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
          if (rawText === "" || /^(?:na|n\/a|nil|null|none|-)$/i.test(rawText))
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
      if (rawText === "" || /^(?:na|n\/a|nil|null|none|-)$/i.test(rawText))
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
    throw new NrPrbError("NO_VALID_MEASUREMENTS");
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
