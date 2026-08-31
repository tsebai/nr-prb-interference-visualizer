import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const targetUrl =
  process.env.CAPTURE_URL ??
  "http://127.0.0.1:4321/tools/nr-prb-interference-visualizer/";
const outputDirectory = path.resolve("docs/screenshots");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch();
const variants = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

for (const variant of variants) {
  const page = await browser.newPage({ viewport: variant.viewport });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  const refuse = page.locator("#cookie-refuse-all");
  if (await refuse.isVisible().catch(() => false)) await refuse.click();
  await page.getByRole("button", { name: "Try demo data" }).click();
  await page.locator("[data-results]").waitFor({ state: "visible" });
  const heatmap = page.locator("[data-heatmap]");
  await heatmap.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const layout = await page
    .locator("[data-heatmap-shell]")
    .evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
  if (layout.scrollWidth > layout.clientWidth + 1) {
    throw new Error(`${variant.name} heatmap requires horizontal scrolling.`);
  }
  await page.screenshot({
    path: path.join(outputDirectory, `${variant.name}.png`),
    fullPage: false,
  });
  if (consoleErrors.length > 0) {
    throw new Error(
      `${variant.name} console errors: ${consoleErrors.join(" | ")}`,
    );
  }
  await page.close();
}

const socialPage = await browser.newPage({
  viewport: { width: 1200, height: 630 },
});
await socialPage.goto(targetUrl, { waitUntil: "networkidle" });
const socialRefuse = socialPage.locator("#cookie-refuse-all");
if (await socialRefuse.isVisible().catch(() => false))
  await socialRefuse.click();
await socialPage.screenshot({
  path: path.join(outputDirectory, "social-card.png"),
  fullPage: false,
});
await socialPage.close();

await browser.close();
console.log(
  `Captured desktop, mobile, and social screenshots from ${targetUrl}`,
);
