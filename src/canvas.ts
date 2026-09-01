import type { AnalysisResult, PaletteName, PeriodSummary } from "./types";
import { paletteColor, paletteStops } from "./lib/palette";

interface HeatmapSettings {
  palette: PaletteName;
  higherMeansMore: boolean;
  scaleMin: number;
  scaleMax: number;
  unit: string;
}

interface ViewRange {
  start: number;
  end: number;
}

function analysisValueKey(period: PeriodSummary, prb: number): string {
  const periodKey =
    period.timestampMs === null
      ? `snapshot:${period.order}:${period.label}`
      : `time:${period.timestampMs}`;
  return `${periodKey}|${prb}`;
}

function setCanvasSize(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Canvas rendering is not available in this browser.");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function shortPeriodLabel(label: string): string {
  const date = new Date(label);
  if (Number.isFinite(date.getTime())) {
    return date.toISOString().slice(11, 16);
  }
  return label.length > 16 ? `${label.slice(0, 14)}…` : label;
}

function shortProfilePeriodLabel(label: string): string {
  const date = new Date(label);
  if (Number.isFinite(date.getTime())) {
    return date.toISOString().slice(5, 16).replace("T", " ");
  }
  return label.length > 16 ? `${label.slice(0, 14)}…` : label;
}

export class HeatmapRenderer {
  private analysis: AnalysisResult | null = null;
  private settings: HeatmapSettings | null = null;
  private view: ViewRange = { start: 0, end: 0 };
  private dragging = false;
  private dragX = 0;
  private dragStart = 0;
  private readonly resizeObserver: ResizeObserver;
  private layout = {
    left: 88,
    top: 12,
    right: 14,
    bottom: 48,
    width: 1,
    height: 1,
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly tooltip: HTMLElement,
    private readonly onRangeChange: (label: string) => void,
  ) {
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    canvas.addEventListener("pointermove", (event) =>
      this.handlePointerMove(event),
    );
    canvas.addEventListener("pointerleave", () => {
      this.dragging = false;
      this.tooltip.hidden = true;
    });
    canvas.addEventListener("pointerdown", (event) =>
      this.handlePointerDown(event),
    );
    canvas.addEventListener("pointerup", (event) => {
      this.dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    });
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        if (!this.analysis) return;
        const direction = event.deltaY > 0 ? 1 : -1;
        this.zoom(direction, event.offsetX);
      },
      { passive: false },
    );
    canvas.addEventListener("keydown", (event) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        this.zoom(-1);
      } else if (event.key === "-") {
        event.preventDefault();
        this.zoom(1);
      } else if (event.key === "Home") {
        event.preventDefault();
        this.fit();
      }
    });
  }

  update(
    analysis: AnalysisResult,
    settings: HeatmapSettings,
    preserveView = false,
  ): void {
    this.analysis = analysis;
    this.settings = settings;
    if (
      !preserveView ||
      this.view.end > analysis.prbs.length ||
      this.view.end === 0
    ) {
      this.view = { start: 0, end: analysis.prbs.length };
    }
    this.render();
  }

  fit(): void {
    if (!this.analysis) return;
    this.view = { start: 0, end: this.analysis.prbs.length };
    this.render();
  }

  zoomIn(): void {
    this.zoom(-1);
  }

  zoomOut(): void {
    this.zoom(1);
  }

  async exportPng(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("PNG export failed.")),
        "image/png",
      );
    });
  }

  private zoom(direction: number, pointerX?: number): void {
    if (!this.analysis) return;
    const total = this.analysis.prbs.length;
    const current = Math.max(1, this.view.end - this.view.start);
    const target = clamp(
      Math.round(current * (direction > 0 ? 1.5 : 0.66)),
      Math.min(8, total),
      total,
    );
    const plotWidth = Math.max(
      1,
      this.layout.width - this.layout.left - this.layout.right,
    );
    const anchor =
      pointerX === undefined
        ? 0.5
        : clamp((pointerX - this.layout.left) / plotWidth, 0, 1);
    const centerIndex = this.view.start + current * anchor;
    let start = Math.round(centerIndex - target * anchor);
    start = clamp(start, 0, Math.max(0, total - target));
    this.view = { start, end: start + target };
    this.render();
  }

  private handlePointerDown(event: PointerEvent): void {
    if (
      !this.analysis ||
      this.view.end - this.view.start >= this.analysis.prbs.length
    )
      return;
    this.dragging = true;
    this.dragX = event.clientX;
    this.dragStart = this.view.start;
    this.canvas.setPointerCapture(event.pointerId);
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.analysis || !this.settings) return;
    if (this.dragging) {
      const visible = this.view.end - this.view.start;
      const plotWidth = Math.max(
        1,
        this.layout.width - this.layout.left - this.layout.right,
      );
      const delta = Math.round(
        ((this.dragX - event.clientX) / plotWidth) * visible,
      );
      const start = clamp(
        this.dragStart + delta,
        0,
        this.analysis.prbs.length - visible,
      );
      this.view = { start, end: start + visible };
      this.render();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const plotWidth = this.layout.width - this.layout.left - this.layout.right;
    const plotHeight =
      this.layout.height - this.layout.top - this.layout.bottom;
    if (
      x < this.layout.left ||
      x > this.layout.left + plotWidth ||
      y < this.layout.top ||
      y > this.layout.top + plotHeight
    ) {
      this.tooltip.hidden = true;
      return;
    }
    const visiblePrbs = this.analysis.prbs.slice(
      this.view.start,
      this.view.end,
    );
    const columnIndex = clamp(
      Math.floor(((x - this.layout.left) / plotWidth) * visiblePrbs.length),
      0,
      visiblePrbs.length - 1,
    );
    const rowIndex = clamp(
      Math.floor(
        ((y - this.layout.top) / plotHeight) * this.analysis.periods.length,
      ),
      0,
      this.analysis.periods.length - 1,
    );
    const prb = visiblePrbs[columnIndex];
    const period = this.analysis.periods[rowIndex];
    if (prb === undefined || period === undefined) return;
    const value = this.analysis.values.get(analysisValueKey(period, prb));
    this.tooltip.replaceChildren();
    const lines = [
      `Timestamp: ${period.label}`,
      `Cell: ${this.analysis.cell}`,
      `PRB: ${prb}`,
      `Value: ${value === undefined ? "Missing" : `${value.toFixed(2)} ${this.settings.unit}`}`,
    ];
    lines.forEach((line) => {
      const item = document.createElement("span");
      item.textContent = line;
      this.tooltip.append(item);
    });
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${clamp(x + 12, 8, Math.max(8, rect.width - 230))}px`;
    this.tooltip.style.top = `${clamp(y + 12, 8, Math.max(8, rect.height - 120))}px`;
  }

  private render(): void {
    if (!this.analysis || !this.settings) return;
    const analysis = this.analysis;
    const settings = this.settings;
    const parentWidth = this.canvas.parentElement?.clientWidth ?? 900;
    const width = Math.max(280, parentWidth);
    const rowCount = Math.max(1, analysis.periods.length);
    const height = clamp(160 + rowCount * 7, 330, 720);
    this.layout = {
      left: width < 520 ? 58 : 92,
      top: 12,
      right: 16,
      bottom: 50,
      width,
      height,
    };
    const context = setCanvasSize(this.canvas, width, height);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#11162a";
    context.fillRect(0, 0, width, height);

    const visiblePrbs = analysis.prbs.slice(this.view.start, this.view.end);
    const plotWidth = width - this.layout.left - this.layout.right;
    const plotHeight = height - this.layout.top - this.layout.bottom;
    const columnWidth = plotWidth / Math.max(1, visiblePrbs.length);
    const rowHeight = plotHeight / rowCount;
    const scaleSpan = Math.max(1e-12, settings.scaleMax - settings.scaleMin);

    analysis.periods.forEach((period, rowIndex) => {
      visiblePrbs.forEach((prb, columnIndex) => {
        const value = analysis.values.get(analysisValueKey(period, prb));
        if (value === undefined) {
          context.fillStyle = "#242a3d";
        } else {
          let ratio = (value - settings.scaleMin) / scaleSpan;
          if (!settings.higherMeansMore) ratio = 1 - ratio;
          context.fillStyle = paletteColor(settings.palette, ratio);
        }
        const x = this.layout.left + columnIndex * columnWidth;
        const y = this.layout.top + rowIndex * rowHeight;
        context.fillRect(
          Math.floor(x),
          Math.floor(y),
          Math.ceil(columnWidth + 0.2),
          Math.ceil(rowHeight + 0.2),
        );
      });
    });

    context.strokeStyle = "rgba(225, 230, 248, .35)";
    context.lineWidth = 1;
    context.strokeRect(
      this.layout.left,
      this.layout.top,
      plotWidth,
      plotHeight,
    );
    context.fillStyle = "#d9dff3";
    context.font = "11px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.textAlign = "center";
    const xTicks = Math.max(2, Math.floor(plotWidth / 70));
    const xStep = Math.max(1, Math.ceil(visiblePrbs.length / xTicks));
    visiblePrbs.forEach((prb, index) => {
      if (index % xStep !== 0 && index !== visiblePrbs.length - 1) return;
      const x = this.layout.left + (index + 0.5) * columnWidth;
      context.fillText(String(prb), x, height - 28);
    });
    context.fillStyle = "#aeb8d3";
    context.fillText("PRB index", this.layout.left + plotWidth / 2, height - 8);

    context.textAlign = "right";
    const yTicks = Math.max(2, Math.floor(plotHeight / 56));
    const yStep = Math.max(1, Math.ceil(rowCount / yTicks));
    this.analysis.periods.forEach((period, index) => {
      if (index % yStep !== 0 && index !== rowCount - 1) return;
      const y = this.layout.top + (index + 0.5) * rowHeight + 4;
      context.fillText(shortPeriodLabel(period.label), this.layout.left - 7, y);
    });

    const firstPrb = visiblePrbs[0];
    const lastPrb = visiblePrbs.at(-1);
    const label =
      firstPrb === undefined || lastPrb === undefined
        ? "No PRBs"
        : visiblePrbs.length === this.analysis.prbs.length
          ? `Full bandwidth: PRB ${firstPrb} to ${lastPrb}`
          : `Zoomed range: PRB ${firstPrb} to ${lastPrb}`;
    this.onRangeChange(label);
  }
}

export class SummaryChartRenderer {
  private readonly resizeObserver: ResizeObserver;
  private analysis: AnalysisResult | null = null;
  private unit = "";
  private mode: "prb" | "period" = "prb";

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
  }

  update(analysis: AnalysisResult, unit: string, mode: "prb" | "period"): void {
    this.analysis = analysis;
    this.unit = unit;
    this.mode = mode;
    this.render();
  }

  private render(): void {
    if (!this.analysis) return;
    const pointCount =
      this.mode === "prb"
        ? this.analysis.summaries.length
        : this.analysis.periodProfiles.length;
    if (pointCount === 0) return;
    const width = Math.max(280, this.canvas.parentElement?.clientWidth ?? 900);
    const height = 300;
    const context = setCanvasSize(this.canvas, width, height);
    context.fillStyle = "#11162a";
    context.fillRect(0, 0, width, height);
    const legendColumns = width < 520 ? 2 : 4;
    const legendRows = Math.ceil(4 / legendColumns);
    const layout = {
      left: width < 520 ? 52 : 72,
      right: 18,
      top: 24 + legendRows * 18,
      bottom: 42,
    };
    const plotWidth = width - layout.left - layout.right;
    const plotHeight = height - layout.top - layout.bottom;
    const series =
      this.mode === "prb"
        ? [
            { label: "Mean", color: "#70d6c8", key: "mean" as const },
            { label: "Median", color: "#f2cf63", key: "median" as const },
            { label: "Maximum", color: "#f28482", key: "maximum" as const },
            { label: "P95", color: "#9b8afb", key: "p95" as const },
          ]
        : [
            { label: "Minimum", color: "#f2cf63", key: "minimum" as const },
            { label: "Mean", color: "#70d6c8", key: "mean" as const },
            { label: "Maximum", color: "#f28482", key: "maximum" as const },
            { label: "P95", color: "#9b8afb", key: "p95" as const },
          ];
    const valueAt = (seriesIndex: number, pointIndex: number): number => {
      const key = series[seriesIndex]?.key;
      if (!key) return 0;
      if (this.mode === "prb") {
        const summary = this.analysis?.summaries[pointIndex];
        if (!summary || key === "minimum") return 0;
        return summary[key];
      }
      const profile = this.analysis?.periodProfiles[pointIndex];
      if (!profile || key === "median") return 0;
      return profile[key];
    };
    const allValues = series.flatMap((_, seriesIndex) =>
      Array.from({ length: pointCount }, (__, pointIndex) =>
        valueAt(seriesIndex, pointIndex),
      ),
    );
    const minimum = Math.min(...allValues);
    const maximum = Math.max(...allValues);
    const span = Math.max(1e-12, maximum - minimum);

    context.strokeStyle = "rgba(225, 230, 248, .18)";
    context.fillStyle = "#aeb8d3";
    context.font = "11px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.textAlign = "right";
    for (let tick = 0; tick <= 4; tick += 1) {
      const y = layout.top + (tick / 4) * plotHeight;
      context.beginPath();
      context.moveTo(layout.left, y);
      context.lineTo(width - layout.right, y);
      context.stroke();
      context.fillText(
        `${(maximum - (tick / 4) * span).toFixed(1)} ${this.unit}`,
        layout.left - 6,
        y + 4,
      );
    }

    series.forEach((item, seriesIndex) => {
      context.strokeStyle = item.color;
      context.lineWidth = item.label === "Maximum" ? 1.5 : 2;
      context.beginPath();
      for (let index = 0; index < pointCount; index += 1) {
        const value = valueAt(seriesIndex, index);
        const x =
          layout.left + (index / Math.max(1, pointCount - 1)) * plotWidth;
        const y = layout.top + (1 - (value - minimum) / span) * plotHeight;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      if (pointCount === 1) {
        const value = valueAt(seriesIndex, 0);
        const y = layout.top + (1 - (value - minimum) / span) * plotHeight;
        context.beginPath();
        context.arc(layout.left + plotWidth / 2, y, 3, 0, Math.PI * 2);
        context.fillStyle = item.color;
        context.fill();
      }
      const legendColumn = seriesIndex % legendColumns;
      const legendRow = Math.floor(seriesIndex / legendColumns);
      const legendWidth = plotWidth / legendColumns;
      const legendX = layout.left + legendColumn * legendWidth;
      const legendY = 14 + legendRow * 18;
      context.fillStyle = item.color;
      context.fillRect(legendX, legendY, 16, 3);
      context.fillStyle = "#d9dff3";
      context.textAlign = "left";
      context.fillText(item.label, legendX + 21, legendY + 5);
    });

    context.fillStyle = "#aeb8d3";
    context.textAlign = "center";
    const ticks = Math.max(2, Math.floor(plotWidth / 80));
    const step = Math.max(1, Math.ceil(pointCount / ticks));
    for (let index = 0; index < pointCount; index += 1) {
      if (index % step !== 0 && index !== pointCount - 1) continue;
      const x = layout.left + (index / Math.max(1, pointCount - 1)) * plotWidth;
      const label =
        this.mode === "prb"
          ? String(this.analysis.summaries[index]?.prb ?? "")
          : shortProfilePeriodLabel(
              this.analysis.periodProfiles[index]?.period.label ?? "",
            );
      context.fillText(label, x, height - 18);
    }
  }
}

export function drawMiniHeatmap(
  canvas: HTMLCanvasElement,
  analysis: AnalysisResult,
  settings: HeatmapSettings,
): void {
  const width = Math.max(220, canvas.parentElement?.clientWidth ?? 320);
  const height = 92;
  const context = setCanvasSize(canvas, width, height);
  context.fillStyle = "#11162a";
  context.fillRect(0, 0, width, height);
  const span = Math.max(1e-12, settings.scaleMax - settings.scaleMin);
  const columnWidth = width / Math.max(1, analysis.prbs.length);
  const rowHeight = height / Math.max(1, analysis.periods.length);
  analysis.periods.forEach((period, rowIndex) => {
    analysis.prbs.forEach((prb, columnIndex) => {
      const value = analysis.values.get(analysisValueKey(period, prb));
      context.fillStyle = "#242a3d";
      if (value !== undefined) {
        let ratio = (value - settings.scaleMin) / span;
        if (!settings.higherMeansMore) ratio = 1 - ratio;
        context.fillStyle = paletteColor(settings.palette, ratio);
      }
      context.fillRect(
        Math.floor(columnIndex * columnWidth),
        Math.floor(rowIndex * rowHeight),
        Math.ceil(columnWidth + 0.2),
        Math.ceil(rowHeight + 0.2),
      );
    });
  });
}

export function updateLegend(element: HTMLElement, palette: PaletteName): void {
  element.style.background = `linear-gradient(90deg, ${paletteStops(palette).join(", ")})`;
}
