import type { CellValue, ColumnDescriptor, MappingSuggestion } from "../types";

export function normalizeHeader(value: CellValue): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function detectPrbIndex(header: CellValue): number | null {
  const normalized = normalizeHeader(header);
  const match =
    /^(?:prb|rb)_?(\d+)$/.exec(normalized) ?? /^(\d+)$/.exec(normalized);
  if (!match?.[1]) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function findColumn(
  columns: ColumnDescriptor[],
  patterns: RegExp[],
): number | null {
  return (
    columns.find((column) =>
      patterns.some((pattern) => pattern.test(column.normalized)),
    )?.index ?? null
  );
}

export function describeColumns(headers: CellValue[]): ColumnDescriptor[] {
  return headers.map((header, index) => {
    const text = String(header ?? "").trim();
    return {
      index,
      label: text || `Column ${index + 1}`,
      normalized: normalizeHeader(header),
      prbIndex: detectPrbIndex(header),
    };
  });
}

export function detectMapping(headers: CellValue[]): MappingSuggestion {
  const columns = describeColumns(headers);
  const timestampColumn = findColumn(columns, [
    /^timestamp$/,
    /^date_time$/,
    /^datetime$/,
    /^time$/,
    /^period$/,
    /^measurement_time$/,
  ]);
  const cellColumn = findColumn(columns, [
    /^cell_id$/,
    /^cell$/,
    /^nr_cell$/,
    /^gnb_cell$/,
    /^nci$/,
    /^cgi$/,
  ]);
  const prbColumn = findColumn(columns, [
    /^prb$/,
    /^rb$/,
    /^prb_index$/,
    /^rb_index$/,
  ]);
  const valueColumn = findColumn(columns, [
    /^interference$/,
    /^interference_level$/,
    /^value$/,
    /^counter$/,
    /^power$/,
    /^level$/,
  ]);
  const excluded = new Set([
    timestampColumn,
    cellColumn,
    prbColumn,
    valueColumn,
  ]);
  const widePrbColumns = columns
    .filter((column) => column.prbIndex !== null && !excluded.has(column.index))
    .map((column) => ({
      columnIndex: column.index,
      prbIndex: column.prbIndex as number,
    }))
    .sort((left, right) => left.prbIndex - right.prbIndex);

  const format = widePrbColumns.length >= 2 ? "wide" : "long";
  return {
    format,
    timestampColumn,
    cellColumn,
    prbColumn,
    valueColumn,
    widePrbColumns,
  };
}
