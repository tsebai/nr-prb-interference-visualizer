import type { CellValue, ColumnDescriptor, MappingSuggestion } from "../types";

export function normalizeHeader(value: CellValue): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function detectPrbIndex(header: CellValue): number | null {
  const text = String(header ?? "")
    .trim()
    .toLowerCase();
  const normalized = normalizeHeader(header);
  const match =
    /(?:^|[^a-z0-9])(?:prb|rb)[\s_.-]*(\d+)(?=$|[^0-9])/.exec(text) ??
    /^(?:prb|rb)_?(\d+)$/.exec(normalized) ??
    /^(\d+)$/.exec(normalized);
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
  const combinedTimestampColumn = findColumn(columns, [
    /^timestamp$/,
    /^date_time$/,
    /^datetime$/,
    /^period$/,
    /^measurement_timestamp$/,
  ]);
  const dateColumn = findColumn(columns, [
    /^date$/,
    /^measurement_date$/,
    /^report_date$/,
  ]);
  const timeColumn = findColumn(columns, [
    /^time$/,
    /^measurement_time$/,
    /^report_time$/,
  ]);
  const timestampColumn = combinedTimestampColumn ?? dateColumn ?? timeColumn;
  const timestampTimeColumn =
    combinedTimestampColumn === null && dateColumn !== null ? timeColumn : null;
  const cellColumn = findColumn(columns, [
    /^cell_id$/,
    /^cell$/,
    /^cell_name$/,
    /^cellname$/,
    /^local_cell_id$/,
    /^localcell_id$/,
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
    timestampTimeColumn,
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
    timestampTimeColumn,
    cellColumn,
    prbColumn,
    valueColumn,
    widePrbColumns,
  };
}
