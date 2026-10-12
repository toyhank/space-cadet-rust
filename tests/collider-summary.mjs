import fs from "node:fs/promises";import init,* as vpin from "../node_modules/@francisdb/vpin-wasm/vpin.js";
await init({module_or_path:await fs.readFile("./node_modules/@francisdb/vpin-wasm/vpin_bg.wasm")});
const files=vpin.extract(await fs.readFile("assets/vpx-local/JP's Space Cadet/JP's Space Cadet v4.3.vpx"));
const buckets={};
for(const [path,bytes] of Object.entries(files)){
 const m=path.match(/\/gameitems\/(\w+)\..+\.json$/);if(!m)continue;
 const obj=JSON.parse(new TextDecoder().decode(bytes)); const type=m[1],o=obj[type];
 if(!buckets[type])buckets[type]=[];
 buckets[type].push({name:o.name,enabled:o.is_collidable??o.is_enabled,
   b:o.height_bottom,t:o.height_top,height:o.height, n:o.drag_points?.length,
   x:o.center?.x??o.position?.x,y:o.center?.y??o.position?.y,r:o.radius,
   type:o.target_type??o.ramp_type,material:o.physics_material});
}
for(const type of ["Wall","Ramp","Rubber","Flipper","Bumper","HitTarget","Trigger","Kicker","Gate","Spinner"]){
const arr=buckets[type]||[];console.log("\n"+type+" "+arr.length+" enabled "+arr.filter(x=>x.enabled!==false).length);
console.log(JSON.stringify(arr.slice(0,type==="Wall"?85:40)));
}
