import { readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";


const root = resolve(process.argv[2] ?? "dist");
const rootInfo = await stat(root).catch(() => null);
if (!rootInfo?.isDirectory()) throw new Error("Expected build directory: " + root);


const blockedExtensions = /\.(?:vpx|glb|vbs)$/i;
const blockedNames = new Set(["pinball.dat", "cadet.dat", "space-cadet.physics.json", "source-script.vbs"]);
const findings = [];


async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    const relativePath = relative(root, fullPath).split(sep).join("/");
    const privateDirectory = entry.isDirectory() && entry.name.toLowerCase() === "vpx-local";
    const privateName = blockedNames.has(entry.name.toLowerCase());
    const privateExtension = entry.isFile() && blockedExtensions.test(entry.name);
    if (privateDirectory || privateName || privateExtension) findings.push(relativePath);
    if (entry.isDirectory()) await scan(fullPath);
  }
}


const indexInfo = await stat(resolve(root, "index.html")).catch(() => null);
if (!indexInfo?.isFile()) throw new Error("Public build is missing index.html");
await scan(root);
if (findings.length) {
  console.error("Private or table-derived assets found in public build:");
  for (const file of findings) console.error(" - " + file);
  process.exitCode = 1;
} else {
  console.log("Public build audit passed; no VPX/GLB/VBS files, known table DAT names, or vpx-local tree found.");
}
