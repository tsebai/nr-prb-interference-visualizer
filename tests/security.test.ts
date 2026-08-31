import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("privacy and source safety", () => {
  it("does not log imported file names or values", () => {
    const sourceFiles = [
      "src/main.ts",
      "src/worker.ts",
      "src/worker-client.ts",
    ];
    sourceFiles.forEach((file) => {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source).not.toMatch(/console\.(?:log|info|warn|error)/);
    });
  });

  it("does not send imported data through fetch, XHR, or beacon APIs", () => {
    const source = ["src/main.ts", "src/worker.ts", "src/worker-client.ts"]
      .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/sendBeacon/);
  });
});
