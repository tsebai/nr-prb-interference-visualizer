export const NR_PRB_USAGE_EVENT = "nr-prb-usage";

export type NrPrbUsageAction =
  | "file_ready"
  | "demo_loaded"
  | "analysis_completed"
  | "analysis_failed"
  | "template_downloaded"
  | "export_completed";

export type NrPrbUsageContext =
  | "local_file"
  | "demo"
  | "wide"
  | "long"
  | "png"
  | "csv"
  | "print"
  | "file_too_large"
  | "unsupported_file_type"
  | "empty_file"
  | "invalid_file_structure"
  | "malformed_csv"
  | "workbook_unreadable"
  | "worksheet_unreadable"
  | "mapping_required"
  | "measurement_limit"
  | "no_valid_measurements"
  | "period_empty"
  | "scale_invalid"
  | "render_failed"
  | "worker_failed"
  | "unexpected_error"
  | "png_export_failed";

export interface NrPrbUsageEventDetail {
  action: NrPrbUsageAction;
  context: NrPrbUsageContext;
}

export function dispatchNrPrbUsageEvent(
  target: HTMLElement,
  action: NrPrbUsageAction,
  context: NrPrbUsageContext,
): void {
  target.dispatchEvent(
    new CustomEvent<NrPrbUsageEventDetail>(NR_PRB_USAGE_EVENT, {
      bubbles: true,
      composed: true,
      detail: { action, context },
    }),
  );
}
