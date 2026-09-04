import type { CellValue, DecimalMode } from "../types";
import { NrPrbError, type NrPrbErrorCode } from "../errors";

const CANDIDATE_DELIMITERS = [",", ";", "\t"] as const;
const MISSING_MARKERS = new Set(["", "na", "n/a", "null", "none", "-"]);

export class CsvParseError extends NrPrbError {
  constructor(code: NrPrbErrorCode) {
    super(code);
    this.name = "CsvParseError";
  }
}

function countColumns(line: string, delimiter: string): number {
  let count = 1;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      count += 1;
    }
  }
  return count;
}

export function detectDelimiter(text: string): string {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 20);

  if (lines.length === 0) {
    throw new CsvParseError("EMPTY_FILE");
  }

  const ranked = CANDIDATE_DELIMITERS.map((delimiter) => {
    const counts = lines.map((line) => countColumns(line, delimiter));
    const frequency = new Map<number, number>();
    counts.forEach((count) =>
      frequency.set(count, (frequency.get(count) ?? 0) + 1),
    );
    const [modeColumns, modeFrequency] = [...frequency.entries()].sort(
      (left, right) => right[1] - left[1] || right[0] - left[0],
    )[0] ?? [1, 0];
    return {
      delimiter,
      score: modeColumns > 1 ? modeColumns * modeFrequency : 0,
      modeColumns,
    };
  }).sort(
    (left, right) =>
      right.score - left.score || right.modeColumns - left.modeColumns,
  );

  if (!ranked[0] || ranked[0].score === 0) {
    throw new CsvParseError("DELIMITER_NOT_DETECTED");
  }
  return ranked[0].delimiter;
}

export function parseDelimited(
  input: string,
  delimiter = detectDelimiter(input),
  maxRows = 250_000,
): CellValue[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: CellValue[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const pushField = (): void => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = (): void => {
    pushField();
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
      if (rows.length > maxRows) {
        throw new CsvParseError("ROW_LIMIT_EXCEEDED");
      }
    }
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      pushField();
    } else if (character === "\n") {
      pushRow();
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) {
    throw new CsvParseError("CSV_QUOTE_UNCLOSED");
  }
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  if (rows.length < 2) {
    throw new CsvParseError("NO_DATA_ROWS");
  }
  return rows;
}

function normalizedNumericText(value: string): string {
  return value
    .trim()
    .replace(/[\u00A0\u202F\s]/g, "")
    .replace(/\u2212/g, "-");
}

export function parseLocaleNumber(
  value: CellValue,
  mode: DecimalMode,
): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let text = normalizedNumericText(value);
  if (MISSING_MARKERS.has(text.toLowerCase())) return null;

  const commaCount = (text.match(/,/g) ?? []).length;
  const pointCount = (text.match(/\./g) ?? []).length;

  if (mode === "comma") {
    if (commaCount > 1) return null;
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (mode === "point") {
    if (pointCount > 1) return null;
    if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text))
      text = text.replace(/,/g, "");
    else if (commaCount > 0) return null;
  } else if (commaCount > 0 && pointCount > 0) {
    const lastComma = text.lastIndexOf(",");
    const lastPoint = text.lastIndexOf(".");
    if (lastComma > lastPoint) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
  } else if (commaCount === 1) {
    text = text.replace(",", ".");
  } else if (commaCount > 1 || pointCount > 1) {
    return null;
  }

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))
    return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function protectCsvCell(value: string | number): string {
  const text = String(value);
  const protectedText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replace(/"/g, '""')}"`;
}

export function rowsToCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(protectCsvCell).join(",")).join("\r\n");
}
