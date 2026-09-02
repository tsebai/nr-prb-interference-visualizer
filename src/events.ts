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
  | "file_read_failed"
  | "worksheet_read_failed"
  | "mapping_invalid"
  | "analysis_failed"
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
