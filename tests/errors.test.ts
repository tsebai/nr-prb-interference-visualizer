import { describe, expect, it } from "vitest";
import {
  asNrPrbError,
  errorPresentation,
  NR_PRB_ERROR_CODES,
  NrPrbError,
} from "../src/errors";

describe("privacy-safe error handling", () => {
  it("provides an actionable presentation for every stable error code", () => {
    NR_PRB_ERROR_CODES.forEach((code) => {
      const presentation = errorPresentation(code);
      expect(presentation.displayCode).toMatch(/^NR-[A-Z]+-\d{3}$/);
      expect(presentation.title.length).toBeGreaterThan(5);
      expect(presentation.message.length).toBeGreaterThan(10);
      expect(presentation.message).not.toContain("\u2014");
      presentation.steps.forEach((step) =>
        expect(step.length).toBeGreaterThan(8),
      );
    });
  });

  it("preserves known codes and discards unknown raw error text", () => {
    expect(
      asNrPrbError(new NrPrbError("INVALID_SCALE"), "UNEXPECTED_ANALYSIS_ERROR")
        .code,
    ).toBe("INVALID_SCALE");
    const rawSentinel = "private-cell-4100,-87.6543";
    const safe = asNrPrbError(new Error(rawSentinel), "UNEXPECTED_FILE_ERROR");
    expect(safe.code).toBe("UNEXPECTED_FILE_ERROR");
    expect(safe.message).not.toContain(rawSentinel);
  });
});
