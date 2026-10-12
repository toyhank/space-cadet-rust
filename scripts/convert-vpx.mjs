import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import init, * as vpin from '../node_modules/@francisdb/vpin-wasm/vpin.js';
import { convertVpx } from '../vpx/conversion.js';

const [input, output = 'assets/vpx-local/space-cadet.glb'] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node scripts/convert-vpx.mjs "table.vpx" [output.glb]');
  process.exit(1);
}
await init({ module_or_path: await fs.readFile(new URL('../node_modules/@francisdb/vpin-wasm/vpin_bg.wasm', import.meta.url)) });
const bytes = await fs.readFile(input);
let lastLog = 0;
const { glb, report } = convertVpx(vpin, bytes, path.basename(input), message => {
  if (Date.now() - lastLog > 1000) { console.log(message); lastLog = Date.now(); }
});
report.sourceSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
report.glbSha256 = crypto.createHash('sha256').update(glb).digest('hex');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, glb);
await fs.writeFile(output.replace(/\.glb$/i, '') + '.report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, source: report.source, meshes: report.meshes,
  materials: report.materials, textures: report.textures, cameras: report.cameras,
  lights: report.lights, bytes: report.bytes, warnings: report.warnings }, null, 2));
