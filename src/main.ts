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
  createCsvTemplate,
  CSV_TEMPLATE_FILENAMES,
  type CsvTemplateKind,
} from "./lib/templates";
import { APP_TEMPLATE } from "./template";
import type {
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
  private analysis: AnalysisResult | null = null;
  private heatmap: HeatmapRenderer | null = null;
  private summaryChart: SummaryChartRenderer | null = null;
  private initialized = false;

  connectedCallback(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.innerHTML = APP_TEMPLATE;
    this.initializeRenderers();
    this.bindEvents();
  }

  disconnectedCallback(): void {
    this.parser?.terminate();
    this.parser = null;
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
    trigger.addEventListener("click", () => fileInput.click());
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

    requiredElement<HTMLButtonElement>(this, "[data-demo]").addEventListener(
      "click",
      () => {
        const kind = requiredElement<HTMLSelectElement>(
          this,
          "[data-demo-kind]",
        ).value as DemoKind;
        this.loadDemo(kind);
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
      if (this.measurements.length > 0) this.applyAnalysis(true);
    });
    ["[data-direction]", "[data-palette]"].forEach((selector) => {
      requiredElement<HTMLSelectElement>(this, selector).addEventListener(
        "change",
        () => {
          if (this.measurements.length > 0) this.applyAnalysis(true);
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
          if (this.measurements.length > 0) this.applyAnalysis(true);
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
      this.applyAnalysis(false);
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
      this.applyAnalysis(false);
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
      () => window.print(),
    );
    requiredElement<HTMLInputElement>(
      this,
      "[data-overview-toggle]",
    ).addEventListener("change", () => {
      this.renderOverview();
    });
  }

  private async inspectFile(file: File): Promise<void> {
    this.hideError();
    if (file.size > MAX_FILE_BYTES) {
      this.showError("The file exceeds the 25 MB browser safety limit.");
      return;
    }
    const lowerName = file.name.toLowerCase();
    const kind = lowerName.endsWith(".xlsx")
      ? "xlsx"
      : lowerName.endsWith(".csv")
        ? "csv"
        : null;
    if (!kind) {
      this.showError(
        "Select a CSV or XLSX file. Other file types are not processed.",
      );
      return;
    }
    this.parser ??= new ParserWorkerClient();
    this.setProgress(3, "Opening local file");
    try {
      const inspection = await this.parser.inspect(
        file,
        kind,
        (value, message) => this.setProgress(value, message),
      );
      this.inspection = inspection;
      this.normalization = null;
      this.measurements = [];
      this.renderInspection(inspection);
      this.finishProgress();
    } catch (error) {
      this.finishProgress();
      this.showError(
        error instanceof Error ? error.message : "The file could not be read.",
      );
    }
  }

  private async selectSheet(token: string, sheet: string): Promise<void> {
    if (!this.parser) return;
    this.hideError();
    this.setProgress(5, "Switching worksheet locally");
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
      this.finishProgress();
      this.showError(
        error instanceof Error
          ? error.message
          : "The worksheet could not be read.",
      );
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
    if (!this.inspection)
      throw new Error("Open a file before generating the heatmap.");
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
      this.showError("Open a CSV or XLSX file first.");
      return;
    }
    this.hideError();
    const button = requiredElement<HTMLButtonElement>(this, "[data-analyze]");
    button.disabled = true;
    this.setProgress(5, "Processing locally");
    try {
      const result = await this.parser.normalize(
        this.inspection.token,
        this.mappingFromControls(),
        (value, message) => this.setProgress(value, message),
      );
      this.normalization = result;
      this.measurements = result.measurements;
      this.prepareResults();
      this.finishProgress();
    } catch (error) {
      this.finishProgress();
      this.showError(
        error instanceof Error
          ? error.message
          : "The selected mapping is invalid.",
      );
    } finally {
      button.disabled = false;
    }
  }

  private loadDemo(kind: DemoKind): void {
    this.hideError();
    this.inspection = null;
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
    this.prepareResults();
  }

  private prepareResults(): void {
    const results = requiredElement<HTMLElement>(this, "[data-results]");
    results.hidden = false;
    requiredElement<HTMLInputElement>(this, "[data-overview-toggle]").checked =
      false;
    requiredElement<HTMLElement>(this, "[data-overview]").hidden = true;
    const cellSelect = requiredElement<HTMLSelectElement>(
      this,
      "[data-cell-filter]",
    );
    cellSelect.replaceChildren();
    this.applyAnalysis(false);
    results.scrollIntoView({ behavior: "smooth", block: "start" });
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
      startMs: startText ? new Date(startText).getTime() : null,
      endMs: endText ? new Date(endText).getTime() : null,
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

  private applyAnalysis(preserveView: boolean): void {
    if (this.measurements.length === 0) return;
    try {
      const options = this.analysisOptions();
      this.aggregated = aggregateMeasurements(this.measurements, options);
      if (this.aggregated.length === 0)
        throw new Error("No measurements remain inside the selected period.");
      const cells = [
        ...new Set(this.aggregated.map((point) => point.cell)),
      ].sort((left, right) => left.localeCompare(right));
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
      this.analysis = buildAnalysis(this.aggregated, cellSelect.value, options);
      const settings = this.heatmapSettings(this.analysis, options);
      this.heatmap?.update(this.analysis, settings, preserveView);
      this.summaryChart?.update(this.analysis.summaries, this.unitLabel());
      this.renderSummary(this.analysis, cells.length, options);
      this.renderAffectedTable(this.analysis, options);
      this.renderStatus();
      this.renderOverview();
    } catch (error) {
      this.showError(
        error instanceof Error
          ? error.message
          : "The visualization could not be updated.",
      );
    }
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
        throw new Error("Manual scale minimum must be lower than its maximum.");
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
    overview.replaceChildren();
    overview.hidden = !toggle.checked;
    if (!toggle.checked || !this.analysis) return;
    const options = this.analysisOptions();
    const allValues = this.aggregated.map((point) => point.value);
    const globalScale = {
      ...this.heatmapSettings(this.analysis, options),
      scaleMin: Math.min(...allValues),
      scaleMax: Math.max(...allValues),
    };
    this.analysis.cells.forEach((cellName) => {
      const cellAnalysis = buildAnalysis(this.aggregated, cellName, options);
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
      if (blob) downloadBlob(blob, "nr-prb-interference-heatmap.png");
    } catch (error) {
      this.showError(
        error instanceof Error ? error.message : "PNG export failed.",
      );
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
  }

  private downloadCsvTemplate(kind: CsvTemplateKind): void {
    downloadBlob(
      new Blob([createCsvTemplate(kind)], { type: "text/csv;charset=utf-8" }),
      CSV_TEMPLATE_FILENAMES[kind],
    );
  }

  private setProgress(value: number, message: string): void {
    const progress = requiredElement<HTMLElement>(this, "[data-progress]");
    progress.hidden = false;
    requiredElement<HTMLElement>(this, "[data-progress-bar]").style.width =
      `${Math.max(0, Math.min(100, value))}%`;
    requiredElement<HTMLElement>(this, "[data-progress-label]").textContent =
      message;
  }

  private finishProgress(): void {
    this.setProgress(100, "Local processing complete");
    window.setTimeout(() => {
      requiredElement<HTMLElement>(this, "[data-progress]").hidden = true;
    }, 500);
  }

  private showError(message: string): void {
    const error = requiredElement<HTMLElement>(this, "[data-error]");
    error.textContent = message;
    error.hidden = false;
  }

  private hideError(): void {
    const error = requiredElement<HTMLElement>(this, "[data-error]");
    error.textContent = "";
    error.hidden = true;
  }
}

if (!customElements.get("nr-prb-visualizer")) {
  customElements.define("nr-prb-visualizer", NrPrbVisualizer);
}
