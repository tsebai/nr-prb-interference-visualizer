import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  "read-excel-file",
  "fflate",
  "saxen",
  "unzipper-esm",
  "worker-f",
];
const entries = packages.map((name) => {
  const packagePath = path.join(root, "node_modules", name, "package.json");
  const metadata = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  return `| ${metadata.name} | ${metadata.version} | ${metadata.license ?? "See package"} | ${metadata.homepage ?? metadata.repository?.url ?? "See package metadata"} |`;
});
const output = `# Third-Party Notices

The runtime dependencies below are bundled locally. No third-party CDN is used while a file is analyzed.

| Package | Version | License | Project |
| --- | --- | --- | --- |
${entries.join("\n")}

The full license texts remain available in each dependency package. The HiCellTek NR PRB Interference Visualizer is licensed under the MIT License.
`;
fs.writeFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), output, "utf8");
process.stdout.write("Third-party notices generated.\n");
