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

function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    return { code: "PARSE_ERROR", message: error.message.slice(0, 500) };
  }
  return { code: "PARSE_ERROR", message: "The file could not be parsed." };
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
  if (matrix.length < 2)
    throw new Error(
      "The selected sheet must contain a header row and at least one data row.",
    );
  const headers = matrix[0] ?? [];
  if (headers.length === 0)
    throw new Error("The selected sheet has no columns.");
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
    throw new Error("The file exceeds the 25 MB browser safety limit.");
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
    const workbookSheets = await readXlsxWorkbook(request.file);
    const firstSheet = workbookSheets[0];
    if (!firstSheet)
      throw new Error("The workbook has no readable worksheets.");
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
    throw new Error(
      "The selected worksheet is no longer available. Reopen the file.",
    );
  }
  progress(request.id, 20, "Reading worksheet");
  const matrix = state.matrices.get(request.sheet);
  if (!matrix) throw new Error("The selected worksheet could not be read.");
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
  if (!state)
    throw new Error("The local file session expired. Reopen the file.");
  const matrix = state.matrices.get(state.activeSheet);
  if (!matrix) throw new Error("No worksheet is available for processing.");
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
        respond({ id: request.id, type: "error", error: safeError(error) });
      }
    })();
  },
);
