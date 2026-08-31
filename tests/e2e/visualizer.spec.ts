import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const root = fileURLToPath(new URL("../..", import.meta.url));

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
