export type DataFormat = "wide" | "long";
export type UnitMode = "dbm" | "db" | "raw" | "custom";
export type DecimalMode = "auto" | "point" | "comma";
export type PaletteName = "cividis" | "viridis" | "magma" | "blue-orange";

export type CellValue = string | number | boolean | Date | null;

export interface ColumnDescriptor {
  index: number;
  label: string;
  normalized: string;
  prbIndex: number | null;
}

export interface MappingSuggestion {
  format: DataFormat;
  timestampColumn: number | null;
  cellColumn: number | null;
  prbColumn: number | null;
  valueColumn: number | null;
  widePrbColumns: Array<{ columnIndex: number; prbIndex: number }>;
}

export interface InspectionResult {
  token: string;
  sheets: string[];
  activeSheet: string;
  columns: ColumnDescriptor[];
  preview: CellValue[][];
  rowCount: number;
  delimiter: string | null;
  suggestion: MappingSuggestion;
  warnings: string[];
}

export interface ColumnMapping {
  format: DataFormat;
  timestampColumn: number | null;
  cellColumn: number | null;
  prbColumn: number | null;
  valueColumn: number | null;
  widePrbColumns: Array<{ columnIndex: number; prbIndex: number }>;
  decimalMode: DecimalMode;
}

export interface Measurement {
  timestampMs: number | null;
  timestampLabel: string;
  periodOrder: number;
  cell: string;
  prb: number;
  value: number;
}

export interface NormalizationResult {
  measurements: Measurement[];
  invalidTimestampCount: number;
  invalidValueCount: number;
  missingValueCount: number;
  duplicateHeaderCount: number;
  sourceRowCount: number;
  warnings: string[];
}

export interface WorkerError {
  code: string;
  message: string;
}

export type WorkerRequest =
  | { id: number; type: "inspect"; kind: "csv" | "xlsx"; file: File }
  | { id: number; type: "sheet"; token: string; sheet: string }
  | { id: number; type: "normalize"; token: string; mapping: ColumnMapping };

export type WorkerResponse =
  | { id: number; type: "progress"; value: number; message: string }
  | { id: number; type: "inspection"; result: InspectionResult }
  | { id: number; type: "normalized"; result: NormalizationResult }
  | { id: number; type: "error"; error: WorkerError };

export interface AggregatedPoint {
  timestampMs: number | null;
  timestampLabel: string;
  periodOrder: number;
  cell: string;
  prb: number;
  value: number;
  samples: number;
}

export interface PrbSummary {
  prb: number;
  mean: number;
  median: number;
  maximum: number;
  p95: number;
  thresholdPercent: number | null;
  samples: number;
}

export interface PeriodSummary {
  key: string;
  timestampMs: number | null;
  label: string;
  order: number;
}

export interface AnalysisResult {
  cell: string;
  cells: string[];
  prbs: number[];
  periods: PeriodSummary[];
  values: Map<string, number>;
  summaries: PrbSummary[];
  missingValues: number;
  rangeStart: string;
  rangeEnd: string;
  scaleMin: number;
  scaleMax: number;
}

export interface AnalysisOptions {
  unitMode: UnitMode;
  higherMeansMore: boolean;
  threshold: number | null;
  intervalMs: number;
  startMs: number | null;
  endMs: number | null;
}
