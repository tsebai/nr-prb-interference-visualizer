export const NR_PRB_ERROR_CODES = [
  "FILE_REQUIRED",
  "FILE_TOO_LARGE",
  "UNSUPPORTED_FILE_TYPE",
  "EMPTY_FILE",
  "DELIMITER_NOT_DETECTED",
  "CSV_QUOTE_UNCLOSED",
  "NO_DATA_ROWS",
  "NO_COLUMNS",
  "ROW_LIMIT_EXCEEDED",
  "WORKBOOK_UNREADABLE",
  "NO_WORKSHEETS",
  "SHEET_UNAVAILABLE",
  "SHEET_UNREADABLE",
  "SESSION_EXPIRED",
  "WIDE_PRB_MAPPING_REQUIRED",
  "LONG_MAPPING_REQUIRED",
  "MEASUREMENT_LIMIT",
  "NO_VALID_MEASUREMENTS",
  "NO_PERIOD_DATA",
  "INVALID_SCALE",
  "RENDER_UNAVAILABLE",
  "WORKER_FAILED",
  "PNG_EXPORT_FAILED",
  "UNEXPECTED_FILE_ERROR",
  "UNEXPECTED_ANALYSIS_ERROR",
] as const;

export type NrPrbErrorCode = (typeof NR_PRB_ERROR_CODES)[number];

export type NrPrbRecoveryAction =
  | "choose_file"
  | "review_mapping"
  | "review_period"
  | "review_scale"
  | "download_wide_template"
  | "download_long_template";

export interface NrPrbErrorPresentation {
  displayCode: string;
  title: string;
  message: string;
  steps: readonly string[];
  recovery: readonly NrPrbRecoveryAction[];
  focusSelector?: string;
}

const ERROR_PRESENTATIONS: Record<NrPrbErrorCode, NrPrbErrorPresentation> = {
  FILE_REQUIRED: {
    displayCode: "NR-INPUT-001",
    title: "No file is ready",
    message: "Select a CSV or XLSX file before generating the heatmap.",
    steps: [
      "Choose a local file, or use synthetic demo data to test the workflow.",
    ],
    recovery: [
      "choose_file",
      "download_wide_template",
      "download_long_template",
    ],
  },
  FILE_TOO_LARGE: {
    displayCode: "NR-INPUT-002",
    title: "File is above the safe browser limit",
    message:
      "This tool processes files up to 25 MB to avoid exhausting browser memory.",
    steps: [
      "Export a shorter time range or fewer cells.",
      "Keep the PRB columns you need, then reopen the reduced file.",
    ],
    recovery: ["choose_file"],
  },
  UNSUPPORTED_FILE_TYPE: {
    displayCode: "NR-INPUT-003",
    title: "Unsupported file type",
    message: "Only CSV and XLSX files are processed.",
    steps: ["Export the counters as .csv or .xlsx, then select the new file."],
    recovery: [
      "choose_file",
      "download_wide_template",
      "download_long_template",
    ],
  },
  EMPTY_FILE: {
    displayCode: "NR-CSV-001",
    title: "The CSV file is empty",
    message: "No header or measurement row was found.",
    steps: ["Add the expected headers and at least one measurement row."],
    recovery: [
      "choose_file",
      "download_wide_template",
      "download_long_template",
    ],
  },
  DELIMITER_NOT_DETECTED: {
    displayCode: "NR-CSV-002",
    title: "CSV separator was not detected",
    message:
      "The file does not contain a consistent comma, semicolon, or tab separator.",
    steps: [
      "Save the file using comma, semicolon, or tab-separated columns.",
      "Check that the header and data rows use the same separator.",
    ],
    recovery: [
      "choose_file",
      "download_wide_template",
      "download_long_template",
    ],
  },
  CSV_QUOTE_UNCLOSED: {
    displayCode: "NR-CSV-003",
    title: "CSV quoting is incomplete",
    message: "A quoted field is missing its closing quotation mark.",
    steps: ["Correct the unmatched quote in the source file, then reopen it."],
    recovery: ["choose_file"],
  },
  NO_DATA_ROWS: {
    displayCode: "NR-INPUT-004",
    title: "No measurement rows were found",
    message:
      "The selected file or worksheet contains a header but no data row.",
    steps: ["Add at least one measurement row below the headers."],
    recovery: [
      "choose_file",
      "download_wide_template",
      "download_long_template",
    ],
  },
  NO_COLUMNS: {
    displayCode: "NR-INPUT-005",
    title: "No columns were found",
    message: "The selected worksheet does not contain a readable header row.",
    steps: ["Add column headers on the first row, then reopen the file."],
    recovery: [
      "choose_file",
      "download_wide_template",
      "download_long_template",
    ],
  },
  ROW_LIMIT_EXCEEDED: {
    displayCode: "NR-INPUT-006",
    title: "CSV row limit exceeded",
    message:
      "The CSV contains more than 250,000 rows and was stopped before analysis.",
    steps: ["Export a shorter period or split the data into smaller files."],
    recovery: ["choose_file"],
  },
  WORKBOOK_UNREADABLE: {
    displayCode: "NR-XLSX-001",
    title: "Workbook could not be read",
    message:
      "The XLSX file is damaged, encrypted, password-protected, or not a valid workbook.",
    steps: [
      "Open and resave the workbook as .xlsx, or export the worksheet as CSV.",
    ],
    recovery: ["choose_file", "download_long_template"],
  },
  NO_WORKSHEETS: {
    displayCode: "NR-XLSX-002",
    title: "No readable worksheet was found",
    message: "The workbook does not contain a worksheet that can be analyzed.",
    steps: [
      "Add a worksheet with headers and measurement rows, then reopen the workbook.",
    ],
    recovery: ["choose_file", "download_long_template"],
  },
  SHEET_UNAVAILABLE: {
    displayCode: "NR-XLSX-003",
    title: "Worksheet is no longer available",
    message:
      "The local workbook session changed before the worksheet could be opened.",
    steps: ["Reopen the XLSX file and select the worksheet again."],
    recovery: ["choose_file"],
  },
  SHEET_UNREADABLE: {
    displayCode: "NR-XLSX-004",
    title: "Worksheet could not be read",
    message: "The selected worksheet is not available for local processing.",
    steps: ["Select another worksheet, or export this worksheet as CSV."],
    recovery: ["choose_file"],
  },
  SESSION_EXPIRED: {
    displayCode: "NR-INPUT-007",
    title: "Local file session expired",
    message:
      "The browser released the in-memory file before analysis completed.",
    steps: ["Reopen the original file and generate the heatmap again."],
    recovery: ["choose_file"],
  },
  WIDE_PRB_MAPPING_REQUIRED: {
    displayCode: "NR-MAP-001",
    title: "No PRB columns are mapped",
    message: "Wide layout needs columns whose headers identify the PRB index.",
    steps: [
      "Use headers such as PRB_0, PRB0, RB_0, RB0, or a numeric index.",
      "If PRB and value are separate columns, switch the data layout to Long.",
    ],
    recovery: ["review_mapping", "download_wide_template"],
    focusSelector: "[data-format]",
  },
  LONG_MAPPING_REQUIRED: {
    displayCode: "NR-MAP-002",
    title: "Long-format mapping is incomplete",
    message:
      "Select both the PRB index column and the interference value column.",
    steps: [
      "Confirm the two column selectors, then generate the heatmap again.",
    ],
    recovery: ["review_mapping", "download_long_template"],
    focusSelector: "[data-prb-column]",
  },
  MEASUREMENT_LIMIT: {
    displayCode: "NR-DATA-001",
    title: "Measurement limit exceeded",
    message: "More than 2,000,000 valid PRB measurements were detected.",
    steps: [
      "Export fewer cells, a shorter period, or split the dataset before retrying.",
    ],
    recovery: ["choose_file"],
  },
  NO_VALID_MEASUREMENTS: {
    displayCode: "NR-DATA-002",
    title: "No valid PRB measurements were found",
    message:
      "The selected mapping did not produce any usable PRB and value pairs.",
    steps: [
      "Confirm the PRB and value columns.",
      "Check the decimal convention and timestamp mapping.",
      "Use a snapshot mapping when the file has no timestamp.",
    ],
    recovery: [
      "review_mapping",
      "download_wide_template",
      "download_long_template",
    ],
    focusSelector: "[data-format]",
  },
  NO_PERIOD_DATA: {
    displayCode: "NR-FILTER-001",
    title: "No measurements match this period",
    message: "The selected date range excludes every valid measurement.",
    steps: [
      "Clear or widen the From and To values, then apply the period filter again.",
    ],
    recovery: ["review_period"],
    focusSelector: "[data-start]",
  },
  INVALID_SCALE: {
    displayCode: "NR-SCALE-001",
    title: "Manual color scale is invalid",
    message: "Enter a numeric minimum that is lower than the numeric maximum.",
    steps: [
      "Correct both scale values, or switch the color scale back to Automatic range.",
    ],
    recovery: ["review_scale"],
    focusSelector: "[data-scale-min]",
  },
  RENDER_UNAVAILABLE: {
    displayCode: "NR-RENDER-001",
    title: "Heatmap rendering is unavailable",
    message:
      "This browser did not provide the canvas features required by the heatmap.",
    steps: [
      "Update the browser, enable hardware graphics, or try another current browser.",
    ],
    recovery: [],
  },
  WORKER_FAILED: {
    displayCode: "NR-WORKER-001",
    title: "Local parser stopped",
    message: "The browser worker ended before local processing completed.",
    steps: [
      "Reopen the file. If it happens again, reduce the file size and retry.",
    ],
    recovery: ["choose_file"],
  },
  PNG_EXPORT_FAILED: {
    displayCode: "NR-EXPORT-001",
    title: "PNG export failed",
    message: "The browser could not create an image from the current heatmap.",
    steps: [
      "Keep the heatmap visible and retry, or use the browser print view.",
    ],
    recovery: [],
  },
  UNEXPECTED_FILE_ERROR: {
    displayCode: "NR-INPUT-999",
    title: "File could not be processed",
    message: "Local parsing stopped before the column preview was ready.",
    steps: [
      "Reopen the file, or export the same data as a clean CSV and retry.",
    ],
    recovery: [
      "choose_file",
      "download_wide_template",
      "download_long_template",
    ],
  },
  UNEXPECTED_ANALYSIS_ERROR: {
    displayCode: "NR-ANALYSIS-999",
    title: "Visualization could not be updated",
    message:
      "The local analysis stopped before a complete result could be rendered.",
    steps: [
      "Review the mapping and settings, then generate the heatmap again.",
    ],
    recovery: ["review_mapping"],
  },
};

const ERROR_CODE_SET = new Set<string>(NR_PRB_ERROR_CODES);

export class NrPrbError extends Error {
  readonly code: NrPrbErrorCode;

  constructor(code: NrPrbErrorCode) {
    super(ERROR_PRESENTATIONS[code].message);
    this.name = "NrPrbError";
    this.code = code;
  }
}

export function isNrPrbErrorCode(value: unknown): value is NrPrbErrorCode {
  return typeof value === "string" && ERROR_CODE_SET.has(value);
}

export function errorPresentation(
  code: NrPrbErrorCode,
): NrPrbErrorPresentation {
  return ERROR_PRESENTATIONS[code];
}

export function asNrPrbError(
  error: unknown,
  fallback: NrPrbErrorCode,
): NrPrbError {
  if (error instanceof NrPrbError) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    isNrPrbErrorCode(error.code)
  ) {
    return new NrPrbError(error.code);
  }
  return new NrPrbError(fallback);
}
