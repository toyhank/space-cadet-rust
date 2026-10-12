import fs from 'node:fs/promises';
import init,* as vpin from '../node_modules/@francisdb/vpin-wasm/vpin.js';
import {extractVPXPhysics} from '../vpx/physics-extract.js';
const source=process.argv[2]||"assets/vpx-local/JP's Space Cadet/JP's Space Cadet v4.3.vpx";
const destination=process.argv[3]||"assets/vpx-local/space-cadet.physics.json";
await init({module_or_path:await fs.readFile("./node_modules/@francisdb/vpin-wasm/vpin_bg.wasm")});
const files=vpin.extract(await fs.readFile(source));
const physics=extractVPXPhysics(files);
await fs.writeFile(destination,JSON.stringify(physics));
console.log("VPX physics extracted:",JSON.stringify({
  out:destination,size:(await fs.stat(destination)).size,
  walls:physics.segments.filter(x=>x.type==="Wall").length,
  targets:physics.segments.filter(x=>x.type==="HitTarget").length,
  gates:physics.segments.filter(x=>x.type==="Gate").length,
  rubber:physics.segments.filter(x=>x.type==="Rubber").length,
  circles:physics.circles.length,flippers:physics.flippers,
  kickers:physics.kickers.map(x=>x.name),
  triggers:physics.triggers.length,ramps:physics.ramps.length
},null,2));
