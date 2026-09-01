import { rowsToCsv } from "./csv";

export type CsvTemplateKind = "wide" | "long";

const TEMPLATE_HEADERS: Record<CsvTemplateKind, string[]> = {
  wide: ["timestamp", "cell_id", "PRB_0", "PRB_1", "PRB_2"],
  long: ["timestamp", "cell_id", "prb", "interference"],
};

export const CSV_TEMPLATE_FILENAMES: Record<CsvTemplateKind, string> = {
  wide: "nr-prb-wide-template.csv",
  long: "nr-prb-long-template.csv",
};

export function createCsvTemplate(kind: CsvTemplateKind): string {
  return rowsToCsv([TEMPLATE_HEADERS[kind]]);
}
