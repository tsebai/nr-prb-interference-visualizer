import { describe, expect, it } from "vitest";
import {
  createCsvTemplate,
  CSV_TEMPLATE_FILENAMES,
} from "../src/lib/templates";

describe("empty CSV templates", () => {
  it("creates a header-only wide template without assuming 273 PRBs", () => {
    const template = createCsvTemplate("wide");

    expect(CSV_TEMPLATE_FILENAMES.wide).toBe("nr-prb-wide-template.csv");
    expect(template).toBe('"timestamp","cell_id","PRB_0","PRB_1","PRB_2"');
    expect(template.split(/\r?\n/)).toHaveLength(1);
    expect(template).not.toContain("PRB_272");
  });

  it("creates a header-only long template", () => {
    const template = createCsvTemplate("long");

    expect(CSV_TEMPLATE_FILENAMES.long).toBe("nr-prb-long-template.csv");
    expect(template).toBe('"timestamp","cell_id","prb","interference"');
    expect(template.split(/\r?\n/)).toHaveLength(1);
  });
});
