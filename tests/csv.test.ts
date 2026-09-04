import { describe, expect, it } from "vitest";
import {
  detectDelimiter,
  parseDelimited,
  parseLocaleNumber,
  protectCsvCell,
  rowsToCsv,
} from "../src/lib/csv";
import { NrPrbError } from "../src/errors";

describe("CSV parsing", () => {
  it("detects comma, semicolon, and tab delimiters", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("parses quoted delimiters and escaped quotes", () => {
    expect(parseDelimited('a,b\n"x,y","say ""hello"""')).toEqual([
      ["a", "b"],
      ["x,y", 'say "hello"'],
    ]);
  });

  it("returns stable codes for empty, malformed, and incomplete CSV input", () => {
    const codeFrom = (operation: () => unknown): string => {
      try {
        operation();
        return "NO_ERROR";
      } catch (error) {
        expect(error).toBeInstanceOf(NrPrbError);
        return (error as NrPrbError).code;
      }
    };

    expect(codeFrom(() => detectDelimiter("\n\r\n"))).toBe("EMPTY_FILE");
    expect(codeFrom(() => detectDelimiter("one column\nsecond row"))).toBe(
      "DELIMITER_NOT_DETECTED",
    );
    expect(codeFrom(() => parseDelimited('a,b\n"not closed,1', ","))).toBe(
      "CSV_QUOTE_UNCLOSED",
    );
    expect(codeFrom(() => parseDelimited("a,b", ","))).toBe("NO_DATA_ROWS");
  });

  it("handles point and comma decimals when unambiguous", () => {
    expect(parseLocaleNumber("-103.25", "auto")).toBe(-103.25);
    expect(parseLocaleNumber("-103,25", "auto")).toBe(-103.25);
    expect(parseLocaleNumber("1.234,5", "auto")).toBe(1234.5);
    expect(parseLocaleNumber("1,234.5", "auto")).toBe(1234.5);
    expect(parseLocaleNumber("1,2,3", "auto")).toBeNull();
  });

  it("neutralizes spreadsheet formulas in exported CSV cells", () => {
    expect(protectCsvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(protectCsvCell("+SUM(A1:A2)")).toBe('"\'+SUM(A1:A2)"');
    expect(
      rowsToCsv([
        ["cell", "@command"],
        [1, -95],
      ]),
    ).toContain('"\'@command"');
  });
});
