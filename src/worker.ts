/// <reference lib="webworker" />

import type {
  CellValue,
  InspectionResult,
  WorkerRequest,
  WorkerResponse,
} from "./types";
import { parseDelimited, detectDelimiter } from "./lib/csv";
import { describeColumns, detectMapping } from "./lib/detect";
import { normalizeMatrix } from "./lib/normalize";
import { asNrPrbError, NrPrbError, type NrPrbErrorCode } from "./errors";

interface WorkbookState {
  file: File;
  kind: "csv" | "xlsx";
  sheets: string[];
  activeSheet: string;
  matrices: Map<string, CellValue[][]>;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const workbooks = new Map<string, WorkbookState>();
const workerScope = self as unknown as DedicatedWorkerGlobalScope;

function respond(response: WorkerResponse): void {
  workerScope.postMessage(response);
}

function progress(id: number, value: number, message: string): void {
  respond({ id, type: "progress", value, message });
}

function safeError(
  error: unknown,
  fallback: NrPrbErrorCode,
): { code: NrPrbErrorCode } {
  return { code: asNrPrbError(error, fallback).code };
}

function createToken(): string {
  return crypto.randomUUID();
}

async function readXlsxWorkbook(
  file: File,
): Promise<Array<{ sheet: string; data: CellValue[][] }>> {
  const module = await import("read-excel-file/browser");
  const sheets = await module.default(file);
  return sheets as unknown as Array<{ sheet: string; data: CellValue[][] }>;
}

function inspectMatrix(
  token: string,
  sheets: string[],
  activeSheet: string,
  matrix: CellValue[][],
  delimiter: string | null,
): InspectionResult {
  if (matrix.length < 2) throw new NrPrbError("NO_DATA_ROWS");
  const headers = matrix[0] ?? [];
  if (headers.length === 0) throw new NrPrbError("NO_COLUMNS");
  const suggestion = detectMapping(headers);
  const warnings: string[] = [];
  if (matrix.length > 100_000)
    warnings.push("Large file detected. Processing may take several seconds.");
  if (
    suggestion.format === "long" &&
    (suggestion.prbColumn === null || suggestion.valueColumn === null)
  ) {
    warnings.push(
      "Automatic mapping is incomplete. Select the PRB and value columns.",
    );
  }
  if (suggestion.format === "wide" && suggestion.widePrbColumns.length === 0) {
    warnings.push("No PRB columns were detected automatically.");
  }
  return {
    token,
    sheets,
    activeSheet,
    columns: describeColumns(headers),
    preview: matrix.slice(0, 7),
    rowCount: matrix.length - 1,
    delimiter,
    suggestion,
    warnings,
  };
}

async function handleInspect(
  request: Extract<WorkerRequest, { type: "inspect" }>,
): Promise<void> {
  if (request.file.size > MAX_FILE_BYTES)
    throw new NrPrbError("FILE_TOO_LARGE");
  progress(request.id, 5, "Reading file locally");
  const token = createToken();
  let sheets: string[];
  let activeSheet: string;
  let matrix: CellValue[][];
  let delimiter: string | null = null;

  if (request.kind === "csv") {
    const text = await request.file.text();
    progress(request.id, 35, "Detecting delimiter and columns");
    delimiter = detectDelimiter(text);
    matrix = parseDelimited(text, delimiter);
    sheets = ["CSV"];
    activeSheet = "CSV";
  } else {
    progress(request.id, 20, "Loading the spreadsheet parser");
    let workbookSheets: Array<{ sheet: string; data: CellValue[][] }>;
    try {
      workbookSheets = await readXlsxWorkbook(request.file);
    } catch {
      throw new NrPrbError("WORKBOOK_UNREADABLE");
    }
    const firstSheet = workbookSheets[0];
    if (!firstSheet) throw new NrPrbError("NO_WORKSHEETS");
    sheets = workbookSheets.map((sheet) => sheet.sheet);
    activeSheet = firstSheet.sheet;
    progress(request.id, 55, "Reading workbook worksheets");
    matrix = firstSheet.data;
    const matrices = new Map(
      workbookSheets.map((sheet) => [sheet.sheet, sheet.data]),
    );
    const state: WorkbookState = {
      file: request.file,
      kind: request.kind,
      sheets,
      activeSheet,
      matrices,
    };
    workbooks.set(token, state);
    progress(request.id, 85, "Preparing mapping preview");
    respond({
      id: request.id,
      type: "inspection",
      result: inspectMatrix(token, sheets, activeSheet, matrix, delimiter),
    });
    return;
  }

  const state: WorkbookState = {
    file: request.file,
    kind: request.kind,
    sheets,
    activeSheet,
    matrices: new Map([[activeSheet, matrix]]),
  };
  workbooks.set(token, state);
  progress(request.id, 85, "Preparing mapping preview");
  respond({
    id: request.id,
    type: "inspection",
    result: inspectMatrix(token, sheets, activeSheet, matrix, delimiter),
  });
}

function handleSheet(request: Extract<WorkerRequest, { type: "sheet" }>): void {
  const state = workbooks.get(request.token);
  if (
    !state ||
    state.kind !== "xlsx" ||
    !state.sheets.includes(request.sheet)
  ) {
    throw new NrPrbError("SHEET_UNAVAILABLE");
  }
  progress(request.id, 20, "Reading worksheet");
  const matrix = state.matrices.get(request.sheet);
  if (!matrix) throw new NrPrbError("SHEET_UNREADABLE");
  state.activeSheet = request.sheet;
  progress(request.id, 85, "Preparing mapping preview");
  respond({
    id: request.id,
    type: "inspection",
    result: inspectMatrix(
      request.token,
      state.sheets,
      request.sheet,
      matrix,
      null,
    ),
  });
}

function handleNormalize(
  request: Extract<WorkerRequest, { type: "normalize" }>,
): void {
  const state = workbooks.get(request.token);
  if (!state) throw new NrPrbError("SESSION_EXPIRED");
  const matrix = state.matrices.get(state.activeSheet);
  if (!matrix) throw new NrPrbError("SHEET_UNREADABLE");
  progress(request.id, 15, "Validating values");
  const result = normalizeMatrix(matrix, request.mapping);
  progress(request.id, 90, "Finalizing browser-only dataset");
  respond({ id: request.id, type: "normalized", result });
}

workerScope.addEventListener(
  "message",
  (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    void (async () => {
      try {
        if (request.type === "inspect") await handleInspect(request);
        else if (request.type === "sheet") handleSheet(request);
        else handleNormalize(request);
      } catch (error) {
        const fallback =
          request.type === "normalize"
            ? "UNEXPECTED_ANALYSIS_ERROR"
            : "UNEXPECTED_FILE_ERROR";
        respond({
          id: request.id,
          type: "error",
          error: safeError(error, fallback),
        });
      }
    })();
  },
);
