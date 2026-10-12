import fs from 'node:fs/promises';
import init,* as vpin from '../node_modules/@francisdb/vpin-wasm/vpin.js';
await init({module_or_path:await fs.readFile('./node_modules/@francisdb/vpin-wasm/vpin_bg.wasm')});
const files=vpin.extract(await fs.readFile("assets/vpx-local/JP's Space Cadet/JP's Space Cadet v4.3.vpx"));
const names=['Wall','Ramp','Rubber','Flipper','Bumper','Target','Trigger','Kicker','Gate','Spinner','Plunger','HitTarget','Primitive'];
for(const type of names){
  const found=Object.keys(files).filter(x=>x.startsWith('/vpx/gameitems/'+type+'.')&&x.endsWith('.json'));
  console.log('\n==',type,found.length,found.slice(0,4));
  if(found.length){
    const data=JSON.parse(new TextDecoder().decode(files[found[0]]));
    console.log(JSON.stringify(data,null,2).slice(0,6500));
  }
}
