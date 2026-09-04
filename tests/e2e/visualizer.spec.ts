import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const root = fileURLToPath(new URL("../..", import.meta.url));

async function readDownloadedFile(
  downloadPath: string | null,
): Promise<string> {
  if (!downloadPath)
    throw new Error("The browser did not expose the downloaded file path.");
  return readFile(downloadPath, "utf8");
}

test("loads the page and renders the 273 PRB demo without horizontal scrolling", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "5G NR PRB Interference Visualizer" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your network data never leaves your browser."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try demo data" }).click();
  await expect(page.getByText("Full bandwidth: PRB 0 to 272")).toBeVisible();
  await expect(page.locator("[data-summary-prbs]")).toHaveText("273");
  const sizes = await page
    .locator("[data-heatmap-shell]")
    .evaluate((shell) => ({
      clientWidth: shell.clientWidth,
      scrollWidth: shell.scrollWidth,
    }));
  expect(sizes.scrollWidth).toBe(sizes.clientWidth);
  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth);
});

test("downloads empty wide and long CSV templates with the expected headers", async ({
  page,
}) => {
  await page.goto("./");

  const wideTemplateButton = page.getByRole("button", {
    name: "Download wide CSV template",
  });
  const longTemplateButton = page.getByRole("button", {
    name: "Download long CSV template",
  });
  await wideTemplateButton.focus();
  await page.keyboard.press("Tab");
  await expect(longTemplateButton).toBeFocused();

  const wideDownloadEvent = page.waitForEvent("download");
  await wideTemplateButton.click();
  const wideDownload = await wideDownloadEvent;
  expect(wideDownload.suggestedFilename()).toBe("nr-prb-wide-template.csv");
  const widePath = await wideDownload.path();
  expect(widePath).not.toBeNull();
  expect(await readDownloadedFile(widePath)).toBe(
    '"timestamp","cell_id","PRB_0","PRB_1","PRB_2"',
  );

  const longDownloadEvent = page.waitForEvent("download");
  await longTemplateButton.click();
  const longDownload = await longDownloadEvent;
  expect(longDownload.suggestedFilename()).toBe("nr-prb-long-template.csv");
  const longPath = await longDownload.path();
  expect(longPath).not.toBeNull();
  expect(await readDownloadedFile(longPath)).toBe(
    '"timestamp","cell_id","prb","interference"',
  );
});

test("switches cells instantly and shows the compact overview", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("[data-demo-kind]").selectOption("multicell");
  await page.getByRole("button", { name: "Try demo data" }).click();
  await expect(page.locator("[data-cell-filter]")).toHaveValue("SYNTH_CELL_A");
  await page.locator("[data-cell-filter]").selectOption("SYNTH_CELL_B");
  await expect(page.locator("[data-cell-filter]")).toHaveValue("SYNTH_CELL_B");
  await page.locator("[data-overview-toggle]").check();
  await expect(page.locator("[data-overview] figure")).toHaveCount(3);
  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth);
});

test("imports CSV, renders the heatmap, filters, and exports files", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .locator("[data-file-input]")
    .setInputFiles(path.join(root, "samples", "persistent-273-prb.csv"));
  await expect(
    page.getByRole("heading", { name: "Confirm the column mapping" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate heatmap" }).click();
  await expect(page.locator("[data-summary-prbs]")).toHaveText("273");
  await page.locator("[data-interval]").selectOption("900000");
  await expect(page.locator("[data-summary-periods]")).toHaveText("16");
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  expect((await pngDownload).suggestedFilename()).toBe(
    "nr-prb-interference-heatmap.png",
  );
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export summary CSV" }).click();
  expect((await csvDownload).suggestedFilename()).toBe(
    "nr-prb-interference-summary.csv",
  );
});

test("emits only fixed privacy-safe usage events", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => {
    const usageEvents: Array<{ action: string; context: string }> = [];
    document.addEventListener("nr-prb-usage", (event) => {
      const detail = (event as CustomEvent).detail as {
        action: string;
        context: string;
      };
      usageEvents.push({ action: detail.action, context: detail.context });
    });
    (
      window as typeof window & { __nrPrbUsageEvents: typeof usageEvents }
    ).__nrPrbUsageEvents = usageEvents;
  });

  const templateDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download wide CSV template" })
    .click();
  await templateDownload;
  await page.getByRole("button", { name: "Try demo data" }).click();
  await page
    .locator("[data-file-input]")
    .setInputFiles(
      path.join(root, "tests", "fixtures", "privacy-sentinel.csv"),
    );
  await expect(
    page.getByRole("heading", { name: "Confirm the column mapping" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate heatmap" }).click();
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export summary CSV" }).click();
  await csvDownload;

  const events = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __nrPrbUsageEvents: Array<{ action: string; context: string }>;
        }
      ).__nrPrbUsageEvents,
  );
  expect(events).toEqual([
    { action: "template_downloaded", context: "wide" },
    { action: "demo_loaded", context: "demo" },
    { action: "analysis_completed", context: "demo" },
    { action: "file_ready", context: "local_file" },
    { action: "analysis_completed", context: "local_file" },
    { action: "export_completed", context: "csv" },
  ]);
  expect(JSON.stringify(events)).not.toContain("persistent-273-prb.csv");
  expect(JSON.stringify(events)).not.toContain("SYNTH_PRIVATE_SENTINEL_8432");
  expect(JSON.stringify(events)).not.toContain("-87.6543");
});

test("detects OSS-style headers and switches between PRB and time profiles", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .locator("[data-file-input]")
    .setInputFiles(
      path.join(root, "tests", "fixtures", "oss-wide-synthetic.csv"),
    );
  await expect(page.locator("[data-format]")).toHaveValue("wide");
  await expect(page.locator("[data-timestamp]")).toHaveValue("0");
  await expect(page.locator("[data-timestamp-time]")).toHaveValue("1");
  await expect(page.locator("[data-cell-column]")).toHaveValue("3");
  await expect(page.locator("[data-detection]")).toContainText(
    "3 PRB column(s)",
  );

  await page.getByRole("button", { name: "Generate heatmap" }).click();
  await expect(page.locator("[data-cell-filter]")).toHaveValue(
    "SYNTH_OSS_CELL_A",
  );
  await expect(page.locator("[data-summary-prbs]")).toHaveText("3");
  await expect(page.locator("[data-summary-periods]")).toHaveText("2");
  await expect(page.locator("[data-summary-missing]")).toHaveText("2");

  await page.getByRole("button", { name: "By period" }).click();
  await expect(page.locator("[data-profile-period]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Time statistical profile" }),
  ).toBeVisible();
  await expect(page.locator("[data-summary-chart]")).toHaveAttribute(
    "aria-label",
    "Statistical profile by period",
  );
});

test("imports XLSX and allows worksheet selection", async ({ page }) => {
  await page.goto("./");
  await page
    .locator("[data-file-input]")
    .setInputFiles(path.join(root, "samples", "synthetic-prb-examples.xlsx"));
  await expect(page.locator("[data-sheet]")).toBeVisible();
  await page.locator("[data-sheet]").selectOption("Long multi-cell");
  await expect(page.locator("[data-format]")).toHaveValue("long");
  await page.getByRole("button", { name: "Generate heatmap" }).click();
  await expect(page.locator("[data-summary-cells]")).toHaveText("3");
});

test("keeps imported filename and values out of network requests", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.goto("./");
  page.on("request", (request) => {
    requests.push(
      `${request.url()} ${request.postData() ?? ""} ${JSON.stringify(request.headers())}`,
    );
  });
  await page
    .locator("[data-file-input]")
    .setInputFiles(
      path.join(root, "tests", "fixtures", "privacy-sentinel.csv"),
    );
  await page.getByRole("button", { name: "Generate heatmap" }).click();
  await expect(page.locator("[data-cell-filter]")).toHaveValue(
    "SYNTH_PRIVATE_SENTINEL_8432",
  );
  const networkText = requests.join("\n");
  expect(networkText).not.toContain("privacy-sentinel.csv");
  expect(networkText).not.toContain("SYNTH_PRIVATE_SENTINEL_8432");
  expect(networkText).not.toContain("-87.6543");
});

test("explains malformed CSV input without exposing private input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("./");
  await page.evaluate(() => {
    const events: Array<{ action: string; context: string }> = [];
    document.addEventListener("nr-prb-usage", (event) => {
      const detail = (event as CustomEvent).detail as {
        action: string;
        context: string;
      };
      events.push(detail);
    });
    (window as typeof window & { __errorEvents: typeof events }).__errorEvents =
      events;
  });

  await page.locator("[data-file-input]").setInputFiles({
    name: "PRIVATE_NETWORK_SENTINEL.csv",
    mimeType: "text/csv",
    buffer: Buffer.from('timestamp,PRB_0\n"2026-08-31T08:00:00Z,-87.6543'),
  });

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("CSV quoting is incomplete");
  await expect(alert).toContainText("NR-CSV-003");
  await expect(page.locator("[data-progress]")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Choose another file" }),
  ).toBeVisible();
  const events = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __errorEvents: Array<{ action: string; context: string }>;
        }
      ).__errorEvents,
  );
  expect(events).toEqual([
    { action: "analysis_failed", context: "malformed_csv" },
  ]);
  expect(JSON.stringify(events)).not.toContain("PRIVATE_NETWORK_SENTINEL");
  expect(JSON.stringify(events)).not.toContain("-87.6543");
  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth);
});

test("distinguishes common file failures with specific recovery messages", async ({
  page,
}) => {
  await page.goto("./");
  const cases = [
    {
      name: "counters.json",
      mimeType: "application/json",
      content: "{}",
      code: "UNSUPPORTED_FILE_TYPE",
      title: "Unsupported file type",
    },
    {
      name: "empty.csv",
      mimeType: "text/csv",
      content: "",
      code: "EMPTY_FILE",
      title: "The CSV file is empty",
    },
    {
      name: "headers-only.csv",
      mimeType: "text/csv",
      content: "timestamp,PRB_0",
      code: "NO_DATA_ROWS",
      title: "No measurement rows were found",
    },
    {
      name: "damaged.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: "not an xlsx archive",
      code: "WORKBOOK_UNREADABLE",
      title: "Workbook could not be read",
    },
  ];

  for (const item of cases) {
    await page.locator("[data-file-input]").setInputFiles({
      name: item.name,
      mimeType: item.mimeType,
      buffer: Buffer.from(item.content),
    });
    await expect(page.locator("[data-error]")).toHaveAttribute(
      "data-active-error",
      item.code,
    );
    await expect(page.getByRole("alert")).toContainText(item.title);
  }
});

test("guides incomplete long-format mapping back to the exact control", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("[data-file-input]").setInputFiles({
    name: "incomplete-mapping.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "timestamp,unmapped_index,unmapped_counter\n2026-08-31T08:00:00Z,0,-105",
    ),
  });
  await expect(page.locator("[data-format]")).toHaveValue("long");
  await page.getByRole("button", { name: "Generate heatmap" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Long-format mapping is incomplete",
  );
  await expect(page.getByRole("alert")).toContainText("NR-MAP-002");
  await page.getByRole("button", { name: "Review column mapping" }).click();
  await expect(page.locator("[data-prb-column]")).toBeFocused();
});

test("reports only explicit analysis failures, not automatic control refreshes", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(() => {
    const events: Array<{ action: string; context: string }> = [];
    document.addEventListener("nr-prb-usage", (event) => {
      const detail = (event as CustomEvent).detail as {
        action: string;
        context: string;
      };
      events.push(detail);
    });
    (window as typeof window & { __errorEvents: typeof events }).__errorEvents =
      events;
  });
  await page
    .locator("[data-file-input]")
    .setInputFiles(path.join(root, "samples", "persistent-273-prb.csv"));
  await page.getByRole("button", { name: "Generate heatmap" }).click();
  await page.locator("[data-scale-mode]").selectOption("manual");
  await expect(page.getByRole("alert")).toContainText(
    "Manual color scale is invalid",
  );

  let failures = await page.evaluate(() =>
    (
      window as typeof window & {
        __errorEvents: Array<{ action: string; context: string }>;
      }
    ).__errorEvents.filter((event) => event.action === "analysis_failed"),
  );
  expect(failures).toEqual([]);

  await page.getByRole("button", { name: "Apply period filter" }).click();
  failures = await page.evaluate(() =>
    (
      window as typeof window & {
        __errorEvents: Array<{ action: string; context: string }>;
      }
    ).__errorEvents.filter((event) => event.action === "analysis_failed"),
  );
  expect(failures).toEqual([
    { action: "analysis_failed", context: "scale_invalid" },
  ]);
});

test("supports keyboard navigation to the import and heatmap controls", async ({
  page,
}) => {
  await page.goto("./");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator("[data-file-trigger]")).toBeFocused();
  await page.locator("[data-demo-kind]").focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Try demo data" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.locator("[data-heatmap]").focus();
  await page.keyboard.press("Home");
  await expect(page.getByText("Full bandwidth: PRB 0 to 272")).toBeVisible();
});
