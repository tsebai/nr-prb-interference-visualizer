import "./styles.css";
import {
  HeatmapRenderer,
  SummaryChartRenderer,
  drawMiniHeatmap,
} from "./canvas";
import { aggregateMeasurements, buildAnalysis } from "./lib/analysis";
import { rowsToCsv } from "./lib/csv";
import { createDemoMeasurements, type DemoKind } from "./lib/demo";
import {
  dispatchNrPrbUsageEvent,
  type NrPrbUsageAction,
  type NrPrbUsageContext,
} from "./events";
import {
  asNrPrbError,
  errorPresentation,
  NrPrbError,
  type NrPrbErrorCode,
  type NrPrbRecoveryAction,
} from "./errors";
import {
  createCsvTemplate,
  CSV_TEMPLATE_FILENAMES,
  type CsvTemplateKind,
} from "./lib/templates";
import { APP_TEMPLATE } from "./template";
import type {
  AggregatedPoint,
  AnalysisOptions,
  AnalysisResult,
  ColumnDescriptor,
  ColumnMapping,
  InspectionResult,
  Measurement,
  NormalizationResult,
  PaletteName,
  UnitMode,
} from "./types";
import { ParserWorkerClient } from "./worker-client";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const FAILURE_CONTEXT_BY_CODE: Record<NrPrbErrorCode, NrPrbUsageContext> = {
  FILE_REQUIRED: "mapping_required",
  FILE_TOO_LARGE: "file_too_large",
  UNSUPPORTED_FILE_TYPE: "unsupported_file_type",
  EMPTY_FILE: "empty_file",
  DELIMITER_NOT_DETECTED: "invalid_file_structure",
  CSV_QUOTE_UNCLOSED: "malformed_csv",
  NO_DATA_ROWS: "invalid_file_structure",
  NO_COLUMNS: "invalid_file_structure",
  ROW_LIMIT_EXCEEDED: "invalid_file_structure",
  WORKBOOK_UNREADABLE: "workbook_unreadable",
  NO_WORKSHEETS: "workbook_unreadable",
  SHEET_UNAVAILABLE: "worksheet_unreadable",
  SHEET_UNREADABLE: "worksheet_unreadable",
  SESSION_EXPIRED: "worksheet_unreadable",
  WIDE_PRB_MAPPING_REQUIRED: "mapping_required",
  LONG_MAPPING_REQUIRED: "mapping_required",
  MEASUREMENT_LIMIT: "measurement_limit",
  NO_VALID_MEASUREMENTS: "no_valid_measurements",
  INVALID_PERIOD_RANGE: "period_invalid",
  NO_PERIOD_DATA: "period_empty",
  INVALID_SCALE: "scale_invalid",
  RENDER_UNAVAILABLE: "render_failed",
  WORKER_FAILED: "worker_failed",
  PNG_EXPORT_FAILED: "png_export_failed",
  UNEXPECTED_FILE_ERROR: "unexpected_error",
  UNEXPECTED_ANALYSIS_ERROR: "unexpected_error",
};

const RECOVERY_SELECTORS: Record<NrPrbRecoveryAction, string> = {
  choose_file: "[data-error-choose-file]",
  review_mapping: "[data-error-review-mapping]",
  review_period: "[data-error-review-period]",
  review_scale: "[data-error-review-scale]",
  download_wide_template: "[data-error-template-wide]",
  download_long_template: "[data-error-template-long]",
};

function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element)
    throw new Error(`Required interface element is missing: ${selector}`);
  return element;
}

function numericValue(input: HTMLInputElement): number | null {
  if (input.value.trim() === "") return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "Not available";
  const absolute = Math.abs(value);
  const digits = absolute >= 100 ? 1 : 2;
  return value.toFixed(digits);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function option(value: string, label: string): HTMLOptionElement {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

class NrPrbVisualizer extends HTMLElement {
  private parser: ParserWorkerClient | null = null;
  private inspection: InspectionResult | null = null;
  private normalization: NormalizationResult | null = null;
  private measurements: Measurement[] = [];
  private aggregated = [] as ReturnType<typeof aggregateMeasurements>;
  private aggregatedByCell = new Map<string, AggregatedPoint[]>();
  private analysis: AnalysisResult | null = null;
  private heatmap: HeatmapRenderer | null = null;
  private summaryChart: SummaryChartRenderer | null = null;
  private profileMode: "prb" | "period" = "prb";
  private initialized = false;
  private activeError: NrPrbError | null = null;
  private workspaceObserver: IntersectionObserver | null = null;
  private workspaceReported = false;
  private progressHideTimer: number | null = null;

  private reportUsage(
    action: NrPrbUsageAction,
    context: NrPrbUsageContext,
  ): void {
    dispatchNrPrbUsageEvent(this, action, context);
  }

  private reportFailure(error: NrPrbError): void {
    this.reportUsage("analysis_failed", FAILURE_CONTEXT_BY_CODE[error.code]);
  }

  connectedCallback(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.innerHTML = APP_TEMPLATE;
    this.initializeRenderers();
    this.bindEvents();
    this.observeWorkspace();
  }

  disconnectedCallback(): void {
    this.parser?.terminate();
    this.parser = null;
    this.workspaceObserver?.disconnect();
    this.workspaceObserver = null;
    if (this.progressHideTimer !== null) {
      window.clearTimeout(this.progressHideTimer);
      this.progressHideTimer = null;
    }
  }

  startDemo(kind: DemoKind = "persistent"): void {
    if (!this.initialized || this.hasAttribute("aria-busy")) return;
    const allowedKinds: DemoKind[] = ["persistent", "broadband", "multicell"];
    const safeKind = allowedKinds.includes(kind) ? kind : "persistent";
    requiredElement<HTMLSelectElement>(this, "[data-demo-kind]").value =
      safeKind;
    this.reportWorkspaceView();
    this.loadDemo(safeKind);
  }

  focusFileImport(): void {
    if (!this.initialized || this.hasAttribute("aria-busy")) return;
    this.reportWorkspaceView();
    const trigger = requiredElement<HTMLButtonElement>(
      this,
      "[data-file-trigger]",
    );
    trigger.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => trigger.focus(), 250);
  }

  private initializeRenderers(): void {
    const canvas = requiredElement<HTMLCanvasElement>(this, "[data-heatmap]");
    const tooltip = requiredElement<HTMLElement>(this, "[data-tooltip]");
    const rangeLabel = requiredElement<HTMLElement>(
      this,
      "[data-visible-range]",
    );
    this.heatmap = new HeatmapRenderer(canvas, tooltip, (label) => {
      rangeLabel.textContent = label;
    });
    this.summaryChart = new SummaryChartRenderer(
      requiredElement<HTMLCanvasElement>(this, "[data-summary-chart]"),
    );
  }

  private bindEvents(): void {
    const fileInput = requiredElement<HTMLInputElement>(
      this,
      "[data-file-input]",
    );
    const trigger = requiredElement<HTMLButtonElement>(
      this,
      "[data-file-trigger]",
    );
    trigger.addEventListener("click", () => this.openFilePicker(fileInput));
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) void this.inspectFile(file);
      fileInput.value = "";
    });
    ["dragenter", "dragover"].forEach((eventName) => {
      trigger.addEventListener(eventName, (event) => {
        event.preventDefault();
        trigger.classList.add("is-dragging");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      trigger.addEventListener(eventName, (event) => {
        event.preventDefault();
        trigger.classList.remove("is-dragging");
      });
    });
    trigger.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files[0];
      if (file) void this.inspectFile(file);
    });
    requiredElement<HTMLButtonElement>(
      this,
      "[data-error-choose-file]",
    ).addEventListener("click", () => this.openFilePicker(fileInput));
    requiredElement<HTMLButtonElement>(
      this,
      "[data-error-review-mapping]",
    ).addEventListener("click", () => this.focusRecoveryTarget("mapping"));
    requiredElement<HTMLButtonElement>(
      this,
      "[data-error-review-period]",
    ).addEventListener("click", () => this.focusRecoveryTarget("period"));
    requiredElement<HTMLButtonElement>(
      this,
      "[data-error-review-scale]",
    ).addEventListener("click", () => this.focusRecoveryTarget("scale"));
    requiredElement<HTMLButtonElement>(
      this,
      "[data-error-template-wide]",
    ).addEventListener("click", () => this.downloadCsvTemplate("wide"));
    requiredElement<HTMLButtonElement>(
      this,
      "[data-error-template-long]",
    ).addEventListener("click", () => this.downloadCsvTemplate("long"));

    requiredElement<HTMLButtonElement>(this, "[data-demo]").addEventListener(
      "click",
      () => {
        const kind = requiredElement<HTMLSelectElement>(
          this,
          "[data-demo-kind]",
        ).value as DemoKind;
        this.startDemo(kind);
      },
    );
    requiredElement<HTMLButtonElement>(
      this,
      "[data-template-wide]",
    ).addEventListener("click", () => this.downloadCsvTemplate("wide"));
    requiredElement<HTMLButtonElement>(
      this,
      "[data-template-long]",
    ).addEventListener("click", () => this.downloadCsvTemplate("long"));
    requiredElement<HTMLSelectElement>(this, "[data-sheet]").addEventListener(
      "change",
      (event) => {
        const sheet = (event.currentTarget as HTMLSelectElement).value;
        if (this.inspection)
          void this.selectSheet(this.inspection.token, sheet);
      },
    );
    requiredElement<HTMLSelectElement>(this, "[data-format]").addEventListener(
      "change",
      () => {
        this.updateFormatFields();
      },
    );
    requiredElement<HTMLSelectElement>(this, "[data-unit]").addEventListener(
      "change",
      () => {
        this.updateConfigFields();
        if (this.measurements.length > 0) this.applyAnalysis(false);
      },
    );
    requiredElement<HTMLSelectElement>(
      this,
      "[data-scale-mode]",
    ).addEventListener("change", () => {
      this.updateConfigFields();
      if (this.measurements.length > 0) this.applyAnalysis(true, false);
    });
    ["[data-direction]", "[data-palette]"].forEach((selector) => {
      requiredElement<HTMLSelectElement>(this, selector).addEventListener(
        "change",
        () => {
          if (this.measurements.length > 0) this.applyAnalysis(true, false);
        },
      );
    });
    [
      "[data-threshold]",
      "[data-scale-min]",
      "[data-scale-max]",
      "[data-custom-unit]",
    ].forEach((selector) => {
      requiredElement<HTMLInputElement>(this, selector).addEventListener(
        "change",
        () => {
          if (this.measurements.length > 0) this.applyAnalysis(true, false);
        },
      );
    });
    requiredElement<HTMLButtonElement>(this, "[data-analyze]").addEventListener(
      "click",
      () => {
        void this.normalizeAndAnalyze();
      },
    );
    requiredElement<HTMLSelectElement>(
      this,
      "[data-cell-filter]",
    ).addEventListener("change", () => {
      this.applyAnalysis(false, false);
    });
    requiredElement<HTMLSelectElement>(
      this,
      "[data-interval]",
    ).addEventListener("change", () => {
      this.applyAnalysis(false);
    });
    requiredElement<HTMLButtonElement>(
      this,
      "[data-apply-filters]",
    ).addEventListener("click", () => {
      this.applyAnalysis(false, true, true);
    });
    requiredElement<HTMLButtonElement>(this, "[data-fit]").addEventListener(
      "click",
      () => this.heatmap?.fit(),
    );
    requiredElement<HTMLButtonElement>(this, "[data-zoom-in]").addEventListener(
      "click",
      () => this.heatmap?.zoomIn(),
    );
    requiredElement<HTMLButtonElement>(
      this,
      "[data-zoom-out]",
    ).addEventListener("click", () => this.heatmap?.zoomOut());
    requiredElement<HTMLButtonElement>(
      this,
      "[data-export-png]",
    ).addEventListener("click", () => {
      void this.exportPng();
    });
    requiredElement<HTMLButtonElement>(
      this,
      "[data-export-csv]",
    ).addEventListener("click", () => {
      this.exportSummaryCsv();
    });
    requiredElement<HTMLButtonElement>(this, "[data-print]").addEventListener(
      "click",
      () => {
        this.reportUsage("export_completed", "print");
        window.print();
      },
    );
    requiredElement<HTMLInputElement>(
      this,
      "[data-overview-toggle]",
    ).addEventListener("change", () => {
      this.renderOverview();
    });
    requiredElement<HTMLButtonElement>(
      this,
      "[data-profile-prb]",
    ).addEventListener("click", () => this.setProfileMode("prb"));
    requiredElement<HTMLButtonElement>(
      this,
      "[data-profile-period]",
    ).addEventListener("click", () => this.setProfileMode("period"));
  }

  private openFilePicker(fileInput: HTMLInputElement): void {
    fileInput.value = "";
    this.reportWorkspaceView();
    this.reportUsage("file_picker_opened", "local_file");
    fileInput.click();
  }

  private observeWorkspace(): void {
    const importSection = requiredElement<HTMLElement>(this, ".nr-import");
    if (!("IntersectionObserver" in window)) {
      this.reportWorkspaceView();
      return;
    }
    this.workspaceObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.reportWorkspaceView();
        }
      },
      { threshold: 0.2 },
    );
    this.workspaceObserver.observe(importSection);
  }

  private reportWorkspaceView(): void {
    if (this.workspaceReported) return;
    this.workspaceReported = true;
    this.workspaceObserver?.disconnect();
    this.workspaceObserver = null;
    this.reportUsage("workspace_viewed", "workspace");
  }

  private resetForNewInput(): void {
    this.resetParser();
    this.inspection = null;
    this.normalization = null;
    this.measurements = [];
    this.aggregated = [];
    this.aggregatedByCell.clear();
    this.analysis = null;
    requiredElement<HTMLElement>(this, "[data-mapping]").hidden = true;
    requiredElement<HTMLElement>(this, "[data-results]").hidden = true;
  }

  private resetParser(): void {
    this.parser?.terminate();
    this.parser = null;
  }

  private parserForRequest(): ParserWorkerClient {
    if (this.parser) return this.parser;
    try {
      this.parser = new ParserWorkerClient();
      return this.parser;
    } catch {
      throw new NrPrbError("WORKER_FAILED");
    }
  }

  private async inspectFile(file: File): Promise<void> {
    this.hideError();
    this.resetForNewInput();
    if (file.size > MAX_FILE_BYTES) {
      const error = new NrPrbError("FILE_TOO_LARGE");
      this.showError(error, true);
      this.reportFailure(error);
      return;
    }
    const lowerName = file.name.toLowerCase();
    const kind = lowerName.endsWith(".xlsx")
      ? "xlsx"
      : lowerName.endsWith(".csv")
        ? "csv"
        : null;
    if (!kind) {
      const error = new NrPrbError("UNSUPPORTED_FILE_TYPE");
      this.showError(error, true);
      this.reportFailure(error);
      return;
    }
    this.setProgress(3, "Opening local file");
    this.setBusy(true, "file");
    try {
      const inspection = await this.parserForRequest().inspect(
        file,
        kind,
        (value, message) => this.setProgress(value, message),
      );
      this.inspection = inspection;
      this.normalization = null;
      this.measurements = [];
      this.renderInspection(inspection);
      this.finishProgress();
      this.reportUsage("file_ready", "local_file");
    } catch (error) {
      this.stopProgress();
      const localError = asNrPrbError(error, "UNEXPECTED_FILE_ERROR");
      if (localError.code === "WORKER_FAILED") this.resetParser();
      this.showError(localError, true);
      this.reportFailure(localError);
    } finally {
      this.setBusy(false, "file");
    }
  }

  private async selectSheet(token: string, sheet: string): Promise<void> {
    if (!this.parser) return;
    this.hideError();
    this.setProgress(5, "Switching worksheet locally");
    this.setBusy(true, "file");
    try {
      const inspection = await this.parser.selectSheet(
        token,
        sheet,
        (value, message) => this.setProgress(value, message),
      );
      this.inspection = inspection;
      this.renderInspection(inspection);
      this.finishProgress();
    } catch (error) {
      this.stopProgress();
      const localError = asNrPrbError(error, "SHEET_UNREADABLE");
      if (localError.code === "WORKER_FAILED") this.resetParser();
      this.showError(localError, true);
      this.reportFailure(localError);
    } finally {
      this.setBusy(false, "file");
    }
  }

  private renderInspection(inspection: InspectionResult): void {
    const mappingSection = requiredElement<HTMLElement>(this, "[data-mapping]");
    mappingSection.hidden = false;
    requiredElement<HTMLElement>(this, "[data-results]").hidden = true;
    requiredElement<HTMLElement>(this, "[data-row-count]").textContent =
      `${inspection.rowCount.toLocaleString()} source row(s)`;

    const sheetField = requiredElement<HTMLElement>(this, "[data-sheet-field]");
    const sheetSelect = requiredElement<HTMLSelectElement>(
      this,
      "[data-sheet]",
    );
    sheetSelect.replaceChildren(
      ...inspection.sheets.map((sheet) => option(sheet, sheet)),
    );
    sheetSelect.value = inspection.activeSheet;
    sheetField.hidden = inspection.sheets.length <= 1;

    const suggestion = inspection.suggestion;
    const format = requiredElement<HTMLSelectElement>(this, "[data-format]");
    format.value = suggestion.format;
    this.populateColumnSelect(
      requiredElement<HTMLSelectElement>(this, "[data-timestamp]"),
      inspection.columns,
      suggestion.timestampColumn,
      "No timestamp, use snapshot order",
    );
    this.populateColumnSelect(
      requiredElement<HTMLSelectElement>(this, "[data-timestamp-time]"),
      inspection.columns,
      suggestion.timestampTimeColumn,
      "No separate time column",
    );
    this.populateColumnSelect(
      requiredElement<HTMLSelectElement>(this, "[data-cell-column]"),
      inspection.columns,
      suggestion.cellColumn,
      "No cell column",
    );
    this.populateColumnSelect(
      requiredElement<HTMLSelectElement>(this, "[data-prb-column]"),
      inspection.columns,
      suggestion.prbColumn,
      "Select PRB column",
    );
    this.populateColumnSelect(
      requiredElement<HTMLSelectElement>(this, "[data-value-column]"),
      inspection.columns,
      suggestion.valueColumn,
      "Select value column",
    );
    requiredElement<HTMLElement>(this, "[data-detection]").textContent =
      suggestion.format === "wide"
        ? `Wide layout detected with ${suggestion.widePrbColumns.length.toLocaleString()} PRB column(s). PRB indices are dynamic.`
        : "Long layout detected or selected. Confirm the PRB index and value columns.";
    requiredElement<HTMLElement>(this, "[data-mapping-warning]").textContent =
      inspection.warnings.join(" ");
    this.renderPreview(inspection);
    this.updateFormatFields();
    this.updateConfigFields();
    mappingSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  private populateColumnSelect(
    select: HTMLSelectElement,
    columns: ColumnDescriptor[],
    selected: number | null,
    emptyLabel: string,
  ): void {
    const items = [option("-1", emptyLabel)];
    columns.forEach((column) =>
      items.push(option(String(column.index), column.label)),
    );
    select.replaceChildren(...items);
    select.value = selected === null ? "-1" : String(selected);
  }

  private renderPreview(inspection: InspectionResult): void {
    const head = requiredElement<HTMLElement>(this, "[data-preview-head]");
    const body = requiredElement<HTMLElement>(this, "[data-preview-body]");
    head.replaceChildren();
    body.replaceChildren();
    const maximumColumns = 14;
    const columnCount = Math.min(maximumColumns, inspection.columns.length);
    const headerRow = document.createElement("tr");
    inspection.columns.slice(0, columnCount).forEach((column) => {
      const item = document.createElement("th");
      item.scope = "col";
      item.textContent = column.label;
      headerRow.append(item);
    });
    head.append(headerRow);
    inspection.preview.slice(1).forEach((row) => {
      const rowElement = document.createElement("tr");
      row.slice(0, columnCount).forEach((value) => {
        const item = document.createElement("td");
        item.textContent =
          value instanceof Date ? value.toISOString() : String(value ?? "");
        rowElement.append(item);
      });
      body.append(rowElement);
    });
  }

  private updateFormatFields(): void {
    const isLong =
      requiredElement<HTMLSelectElement>(this, "[data-format]").value ===
      "long";
    this.querySelectorAll<HTMLElement>("[data-long-field]").forEach((field) => {
      field.hidden = !isLong;
    });
  }

  private updateConfigFields(): void {
    const custom =
      requiredElement<HTMLSelectElement>(this, "[data-unit]").value ===
      "custom";
    requiredElement<HTMLElement>(this, "[data-custom-unit-field]").hidden =
      !custom;
    const manual =
      requiredElement<HTMLSelectElement>(this, "[data-scale-mode]").value ===
      "manual";
    this.querySelectorAll<HTMLElement>("[data-manual-scale]").forEach(
      (field) => {
        field.hidden = !manual;
      },
    );
  }

  private mappingFromControls(): ColumnMapping {
    if (!this.inspection) throw new NrPrbError("FILE_REQUIRED");
    const format = requiredElement<HTMLSelectElement>(this, "[data-format]")
      .value as "wide" | "long";
    const selectedNumber = (selector: string): number | null => {
      const value = Number(
        requiredElement<HTMLSelectElement>(this, selector).value,
      );
      return value >= 0 ? value : null;
    };
    return {
      format,
      timestampColumn: selectedNumber("[data-timestamp]"),
      timestampTimeColumn: selectedNumber("[data-timestamp-time]"),
      cellColumn: selectedNumber("[data-cell-column]"),
      prbColumn: selectedNumber("[data-prb-column]"),
      valueColumn: selectedNumber("[data-value-column]"),
      widePrbColumns: this.inspection.suggestion.widePrbColumns,
      decimalMode: requiredElement<HTMLSelectElement>(this, "[data-decimal]")
        .value as ColumnMapping["decimalMode"],
    };
  }

  private async normalizeAndAnalyze(): Promise<void> {
    if (!this.parser || !this.inspection) {
      const error = new NrPrbError("FILE_REQUIRED");
      this.showError(error, true);
      return;
    }
    this.hideError();
    this.setProgress(5, "Processing locally");
    this.setBusy(true, "analysis");
    try {
      const result = await this.parser.normalize(
        this.inspection.token,
        this.mappingFromControls(),
        (value, message) => this.setProgress(value, message),
      );
      this.normalization = result;
      this.measurements = result.measurements;
      if (this.prepareResults(true)) {
        this.reportUsage("analysis_completed", "local_file");
      }
      this.finishProgress();
    } catch (error) {
      this.stopProgress();
      const localError = asNrPrbError(error, "UNEXPECTED_ANALYSIS_ERROR");
      if (localError.code === "WORKER_FAILED") this.resetParser();
      this.showError(localError, true);
      this.reportFailure(localError);
    } finally {
      this.setBusy(false, "analysis");
    }
  }

  private loadDemo(kind: DemoKind): void {
    this.hideError();
    this.resetForNewInput();
    this.measurements = createDemoMeasurements(kind);
    this.normalization = {
      measurements: this.measurements,
      invalidTimestampCount: 0,
      invalidValueCount: 0,
      missingValueCount: 0,
      duplicateHeaderCount: 0,
      sourceRowCount: this.measurements.length,
      warnings: ["Synthetic demonstration data is active."],
    };
    requiredElement<HTMLSelectElement>(this, "[data-unit]").value = "dbm";
    requiredElement<HTMLInputElement>(this, "[data-threshold]").value = "-95";
    requiredElement<HTMLElement>(this, "[data-mapping]").hidden = true;
    if (this.prepareResults(false)) {
      this.reportUsage("demo_loaded", "demo");
      this.reportUsage("analysis_completed", "demo");
    }
  }

  private prepareResults(reportFailure: boolean): boolean {
    const results = requiredElement<HTMLElement>(this, "[data-results]");
    results.hidden = false;
    requiredElement<HTMLInputElement>(this, "[data-overview-toggle]").checked =
      false;
    requiredElement<HTMLElement>(this, "[data-overview]").hidden = true;
    requiredElement<HTMLElement>(this, "[data-overview-note]").hidden = true;
    const cellSelect = requiredElement<HTMLSelectElement>(
      this,
      "[data-cell-filter]",
    );
    cellSelect.replaceChildren();
    this.profileMode = "prb";
    this.updateProfileControls();
    this.analysis = null;
    const completed = this.applyAnalysis(false, true, reportFailure);
    results.hidden = !completed;
    if (completed)
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    return completed;
  }

  private analysisOptions(): AnalysisOptions {
    const startText = requiredElement<HTMLInputElement>(
      this,
      "[data-start]",
    ).value;
    const endText = requiredElement<HTMLInputElement>(this, "[data-end]").value;
    const threshold = numericValue(
      requiredElement<HTMLInputElement>(this, "[data-threshold]"),
    );
    const startMs = startText ? new Date(startText).getTime() : null;
    const endMs = endText ? new Date(endText).getTime() : null;
    if (startMs !== null && endMs !== null && startMs > endMs) {
      throw new NrPrbError("INVALID_PERIOD_RANGE");
    }
    return {
      unitMode: requiredElement<HTMLSelectElement>(this, "[data-unit]")
        .value as UnitMode,
      higherMeansMore:
        requiredElement<HTMLSelectElement>(this, "[data-direction]").value ===
        "higher",
      threshold,
      intervalMs: Number(
        requiredElement<HTMLSelectElement>(this, "[data-interval]").value,
      ),
      startMs,
      endMs,
    };
  }

  private unitLabel(): string {
    const unitMode = requiredElement<HTMLSelectElement>(this, "[data-unit]")
      .value as UnitMode;
    if (unitMode === "dbm") return "dBm";
    if (unitMode === "db") return "dB";
    if (unitMode === "raw") return "raw";
    const custom = requiredElement<HTMLInputElement>(
      this,
      "[data-custom-unit]",
    ).value.trim();
    return custom.slice(0, 24) || "units";
  }

  private applyAnalysis(
    preserveView: boolean,
    reaggregate = true,
    reportFailure = false,
  ): boolean {
    if (this.measurements.length === 0) return false;
    try {
      const options = this.analysisOptions();
      if (reaggregate || this.aggregatedByCell.size === 0) {
        this.aggregated = aggregateMeasurements(this.measurements, options);
        this.aggregatedByCell.clear();
        this.aggregated.forEach((point) => {
          const cellPoints = this.aggregatedByCell.get(point.cell) ?? [];
          cellPoints.push(point);
          this.aggregatedByCell.set(point.cell, cellPoints);
        });
      }
      if (this.aggregated.length === 0) throw new NrPrbError("NO_PERIOD_DATA");
      const cells = [...this.aggregatedByCell.keys()].sort((left, right) =>
        left.localeCompare(right),
      );
      const cellSelect = requiredElement<HTMLSelectElement>(
        this,
        "[data-cell-filter]",
      );
      const previousCell = cellSelect.value;
      if (
        cellSelect.options.length !== cells.length ||
        cells.some((cell, index) => cellSelect.options[index]?.value !== cell)
      ) {
        cellSelect.replaceChildren(...cells.map((cell) => option(cell, cell)));
      }
      cellSelect.value = cells.includes(previousCell)
        ? previousCell
        : (cells[0] ?? "");
      this.analysis = buildAnalysis(
        this.aggregatedByCell.get(cellSelect.value) ?? [],
        cellSelect.value,
        options,
        cells,
      );
      const settings = this.heatmapSettings(this.analysis, options);
      this.heatmap?.update(this.analysis, settings, preserveView);
      this.renderProfile();
      this.renderSummary(this.analysis, cells.length, options);
      this.renderAffectedTable(this.analysis, options);
      this.renderStatus();
      this.renderOverview();
      this.hideError();
      return true;
    } catch (error) {
      const localError = asNrPrbError(error, "UNEXPECTED_ANALYSIS_ERROR");
      this.showError(localError, reportFailure);
      if (reportFailure) this.reportFailure(localError);
      return false;
    }
  }

  private setProfileMode(mode: "prb" | "period"): void {
    this.profileMode = mode;
    this.updateProfileControls();
    this.renderProfile();
  }

  private updateProfileControls(): void {
    const byPrb = requiredElement<HTMLButtonElement>(
      this,
      "[data-profile-prb]",
    );
    const byPeriod = requiredElement<HTMLButtonElement>(
      this,
      "[data-profile-period]",
    );
    const prbActive = this.profileMode === "prb";
    byPrb.classList.toggle("is-active", prbActive);
    byPrb.setAttribute("aria-pressed", String(prbActive));
    byPeriod.classList.toggle("is-active", !prbActive);
    byPeriod.setAttribute("aria-pressed", String(!prbActive));
    requiredElement<HTMLElement>(this, "[data-profile-title]").textContent =
      prbActive ? "PRB statistical profile" : "Time statistical profile";
    requiredElement<HTMLElement>(
      this,
      "[data-profile-description]",
    ).textContent = prbActive
      ? "Mean, median, maximum, and P95 across the selected periods."
      : "Minimum, mean, maximum, and P95 across all detected PRBs for each period.";
    requiredElement<HTMLCanvasElement>(
      this,
      "[data-summary-chart]",
    ).setAttribute(
      "aria-label",
      prbActive
        ? "Statistical profile by PRB"
        : "Statistical profile by period",
    );
  }

  private renderProfile(): void {
    if (!this.analysis) return;
    this.summaryChart?.update(
      this.analysis,
      this.unitLabel(),
      this.profileMode,
    );
  }

  private heatmapSettings(analysis: AnalysisResult, options: AnalysisOptions) {
    const scaleMode = requiredElement<HTMLSelectElement>(
      this,
      "[data-scale-mode]",
    ).value;
    let scaleMin = analysis.scaleMin;
    let scaleMax = analysis.scaleMax;
    if (scaleMode === "manual") {
      const manualMinimum = numericValue(
        requiredElement<HTMLInputElement>(this, "[data-scale-min]"),
      );
      const manualMaximum = numericValue(
        requiredElement<HTMLInputElement>(this, "[data-scale-max]"),
      );
      if (
        manualMinimum === null ||
        manualMaximum === null ||
        manualMinimum >= manualMaximum
      ) {
        throw new NrPrbError("INVALID_SCALE");
      }
      scaleMin = manualMinimum;
      scaleMax = manualMaximum;
    }
    if (scaleMin === scaleMax) scaleMax = scaleMin + 1;
    return {
      palette: requiredElement<HTMLSelectElement>(this, "[data-palette]")
        .value as PaletteName,
      higherMeansMore: options.higherMeansMore,
      scaleMin,
      scaleMax,
      unit: this.unitLabel(),
    };
  }

  private renderSummary(
    analysis: AnalysisResult,
    cellCount: number,
    options: AnalysisOptions,
  ): void {
    requiredElement<HTMLElement>(this, "[data-summary-prbs]").textContent =
      analysis.prbs.length.toLocaleString();
    requiredElement<HTMLElement>(this, "[data-summary-periods]").textContent =
      analysis.periods.length.toLocaleString();
    requiredElement<HTMLElement>(this, "[data-summary-cells]").textContent =
      cellCount.toLocaleString();
    requiredElement<HTMLElement>(this, "[data-summary-missing]").textContent = (
      analysis.missingValues + (this.normalization?.missingValueCount ?? 0)
    ).toLocaleString();
    requiredElement<HTMLElement>(this, "[data-summary-range]").textContent =
      analysis.rangeStart === analysis.rangeEnd
        ? analysis.rangeStart
        : `${analysis.rangeStart} to ${analysis.rangeEnd}`;
    requiredElement<HTMLElement>(this, "[data-summary-threshold]").textContent =
      options.threshold === null
        ? "Not set"
        : `${formatNumber(options.threshold)} ${this.unitLabel()}`;
  }

  private renderAffectedTable(
    analysis: AnalysisResult,
    options: AnalysisOptions,
  ): void {
    const body = requiredElement<HTMLElement>(this, "[data-affected-body]");
    body.replaceChildren();
    const ranked = [...analysis.summaries]
      .sort((left, right) =>
        options.higherMeansMore
          ? right.mean - left.mean
          : left.mean - right.mean,
      )
      .slice(0, 20);
    ranked.forEach((summary) => {
      const row = document.createElement("tr");
      const values = [
        String(summary.prb),
        `${formatNumber(summary.mean)} ${this.unitLabel()}`,
        `${formatNumber(summary.maximum)} ${this.unitLabel()}`,
        `${formatNumber(summary.p95)} ${this.unitLabel()}`,
        summary.thresholdPercent === null
          ? "Threshold not set"
          : `${summary.thresholdPercent.toFixed(1)}%`,
      ];
      values.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    });
  }

  private renderStatus(): void {
    const list = requiredElement<HTMLElement>(this, "[data-status-list]");
    const warnings = this.normalization?.warnings ?? [];
    list.replaceChildren();
    warnings.forEach((warning) => {
      const item = document.createElement("div");
      item.textContent = warning;
      list.append(item);
    });
    list.hidden = warnings.length === 0;
  }

  private renderOverview(): void {
    const toggle = requiredElement<HTMLInputElement>(
      this,
      "[data-overview-toggle]",
    );
    const overview = requiredElement<HTMLElement>(this, "[data-overview]");
    const overviewNote = requiredElement<HTMLElement>(
      this,
      "[data-overview-note]",
    );
    overview.replaceChildren();
    overview.hidden = !toggle.checked;
    overviewNote.hidden = !toggle.checked;
    if (!toggle.checked || !this.analysis) return;
    const options = this.analysisOptions();
    let globalMinimum = Number.POSITIVE_INFINITY;
    let globalMaximum = Number.NEGATIVE_INFINITY;
    this.aggregated.forEach((point) => {
      globalMinimum = Math.min(globalMinimum, point.value);
      globalMaximum = Math.max(globalMaximum, point.value);
    });
    const globalScale = {
      ...this.heatmapSettings(this.analysis, options),
      scaleMin: globalMinimum,
      scaleMax: globalMaximum,
    };
    const maximumOverviewCells = 12;
    const visibleCells = [
      this.analysis.cell,
      ...this.analysis.cells.filter((cell) => cell !== this.analysis?.cell),
    ].slice(0, maximumOverviewCells);
    overviewNote.textContent =
      this.analysis.cells.length > maximumOverviewCells
        ? `Showing the selected cell and ${maximumOverviewCells - 1} comparison cells out of ${this.analysis.cells.length.toLocaleString()}. Use the cell selector for the complete set.`
        : `Comparing all ${this.analysis.cells.length.toLocaleString()} detected cell(s) on one shared scale.`;
    visibleCells.forEach((cellName) => {
      const cellAnalysis = buildAnalysis(
        this.aggregatedByCell.get(cellName) ?? [],
        cellName,
        options,
        this.analysis?.cells,
      );
      const figure = document.createElement("figure");
      const caption = document.createElement("figcaption");
      caption.textContent = cellName;
      const canvas = document.createElement("canvas");
      canvas.setAttribute(
        "aria-label",
        `Compact interference heatmap for ${cellName}`,
      );
      figure.append(caption, canvas);
      overview.append(figure);
      drawMiniHeatmap(canvas, cellAnalysis, globalScale);
    });
  }

  private async exportPng(): Promise<void> {
    try {
      const blob = await this.heatmap?.exportPng();
      if (blob) {
        downloadBlob(blob, "nr-prb-interference-heatmap.png");
        this.reportUsage("export_completed", "png");
      }
    } catch (error) {
      const localError = asNrPrbError(error, "PNG_EXPORT_FAILED");
      this.showError(localError, true);
      this.reportFailure(localError);
    }
  }

  private exportSummaryCsv(): void {
    if (!this.analysis) return;
    const rows: Array<Array<string | number>> = [
      [
        "PRB",
        "Mean",
        "Median",
        "Maximum",
        "P95",
        "Periods at threshold percent",
        "Unit",
      ],
      ...this.analysis.summaries.map((summary) => [
        summary.prb,
        summary.mean,
        summary.median,
        summary.maximum,
        summary.p95,
        summary.thresholdPercent ?? "",
        this.unitLabel(),
      ]),
    ];
    downloadBlob(
      new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" }),
      "nr-prb-interference-summary.csv",
    );
    this.reportUsage("export_completed", "csv");
  }

  private downloadCsvTemplate(kind: CsvTemplateKind): void {
    downloadBlob(
      new Blob([createCsvTemplate(kind)], { type: "text/csv;charset=utf-8" }),
      CSV_TEMPLATE_FILENAMES[kind],
    );
    this.reportUsage("template_downloaded", kind);
  }

  private setProgress(value: number, message: string): void {
    if (this.progressHideTimer !== null) {
      window.clearTimeout(this.progressHideTimer);
      this.progressHideTimer = null;
    }
    const progress = requiredElement<HTMLElement>(this, "[data-progress]");
    progress.hidden = false;
    requiredElement<HTMLElement>(this, "[data-progress-bar]").style.width =
      `${Math.max(0, Math.min(100, value))}%`;
    requiredElement<HTMLElement>(this, "[data-progress-label]").textContent =
      message;
  }

  private finishProgress(): void {
    this.setProgress(100, "Local processing complete");
    this.progressHideTimer = window.setTimeout(() => {
      requiredElement<HTMLElement>(this, "[data-progress]").hidden = true;
      this.progressHideTimer = null;
    }, 500);
  }

  private stopProgress(): void {
    if (this.progressHideTimer !== null) {
      window.clearTimeout(this.progressHideTimer);
      this.progressHideTimer = null;
    }
    const progress = requiredElement<HTMLElement>(this, "[data-progress]");
    requiredElement<HTMLElement>(this, "[data-progress-bar]").style.width = "0";
    requiredElement<HTMLElement>(this, "[data-progress-label]").textContent =
      "Local processing stopped";
    progress.hidden = true;
  }

  private setBusy(active: boolean, operation: "file" | "analysis"): void {
    this.toggleAttribute("aria-busy", active);
    ["[data-file-trigger]", "[data-demo]", "[data-analyze]"].forEach(
      (selector) => {
        requiredElement<HTMLButtonElement>(this, selector).disabled = active;
      },
    );
    requiredElement<HTMLSelectElement>(this, "[data-sheet]").disabled = active;
    const analyze = requiredElement<HTMLButtonElement>(this, "[data-analyze]");
    analyze.textContent =
      active && operation === "analysis"
        ? "Generating heatmap..."
        : "Generate heatmap";
  }

  private focusRecoveryTarget(area: "mapping" | "period" | "scale"): void {
    const sectionSelector =
      area === "period" ? "[data-results]" : "[data-mapping]";
    const section = requiredElement<HTMLElement>(this, sectionSelector);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    const presentation = this.activeError
      ? errorPresentation(this.activeError.code)
      : null;
    const fallbackSelector =
      area === "period"
        ? "[data-start]"
        : area === "scale"
          ? "[data-scale-min]"
          : "[data-format]";
    const target = this.querySelector<HTMLElement>(
      presentation?.focusSelector ?? fallbackSelector,
    );
    window.setTimeout(() => target?.focus(), 250);
  }

  private showError(error: NrPrbError, focus = false): void {
    const panel = requiredElement<HTMLElement>(this, "[data-error]");
    const presentation = errorPresentation(error.code);
    this.activeError = error;
    panel.dataset.activeError = error.code;
    requiredElement<HTMLElement>(this, "[data-error-title]").textContent =
      presentation.title;
    requiredElement<HTMLElement>(this, "[data-error-code]").textContent =
      presentation.displayCode;
    requiredElement<HTMLElement>(this, "[data-error-message]").textContent =
      presentation.message;
    const steps = requiredElement<HTMLUListElement>(this, "[data-error-steps]");
    steps.replaceChildren(
      ...presentation.steps.map((step) => {
        const item = document.createElement("li");
        item.textContent = step;
        return item;
      }),
    );
    steps.hidden = presentation.steps.length === 0;
    Object.entries(RECOVERY_SELECTORS).forEach(([action, selector]) => {
      requiredElement<HTMLButtonElement>(this, selector).hidden =
        !presentation.recovery.includes(action as NrPrbRecoveryAction);
    });
    requiredElement<HTMLElement>(this, "[data-error-actions]").hidden =
      presentation.recovery.length === 0;
    panel.hidden = false;
    if (focus) {
      window.requestAnimationFrame(() => {
        panel.focus({ preventScroll: true });
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }

  private hideError(): void {
    const panel = requiredElement<HTMLElement>(this, "[data-error]");
    this.activeError = null;
    delete panel.dataset.activeError;
    panel.hidden = true;
  }
}

if (!customElements.get("nr-prb-visualizer")) {
  customElements.define("nr-prb-visualizer", NrPrbVisualizer);
}
