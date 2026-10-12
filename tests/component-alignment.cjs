const assert=require("node:assert/strict"),fs=require("node:fs");
const {datMetadata,projectWorld,fitCollisionVisual}=require("../renderer3d/dat-geometry.js");
const source=fs.readFileSync("pinball.dat");
const a=datMetadata(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength));
assert.equal(a.groups,541);
assert.deepEqual([a.projection.centerX,a.projection.centerY],[183,238]);
assert.ok(Math.abs(a.projection.distance+400)<.01);
const bumpers=a.components.filter(c=>c.type===1005);
assert.equal(bumpers.length,7);
const actual=[];
for(const c of bumpers){
  assert.ok(c.circle&&c.bounds,"collision metadata missing for "+c.name);
  const fit=fitCollisionVisual(a.projection,c.circle,c.bounds);
  assert.ok(fit,"projection fit missing for "+c.name);
  assert.ok(fit.error<1.35,c.name+" visual center off "+fit.error);
  actual.push({name:c.name,error:+fit.error.toFixed(3),
    position:[+fit.x.toFixed(1),+fit.y.toFixed(1)],height:+fit.height.toFixed(2)});
}
const left=a.components.find(c=>c.type===1003),
      right=a.components.find(c=>c.type===1004);
function screen(c,field){
  const p=c.flipper[field];
  return projectWorld(a.projection,p.x,p.y,0);
}
const flippers=[left,right].map(c=>({name:c.name,pivot:screen(c,"base"),
  idle:screen(c,"idle"),active:screen(c,"active")}));
assert.ok(Math.abs(flippers[0].pivot.x-132.64)<.2);
assert.ok(Math.abs(flippers[1].pivot.x-233.36)<.2);
assert.ok(Math.abs(flippers[0].pivot.y-384.27)<.2);
assert.ok(Math.abs(flippers[0].idle.y-407.73)<.2);
assert.ok(Math.abs(flippers[0].active.y-362.04)<.2);
assert.ok(Math.abs(flippers[1].idle.y-407.73)<.2);
assert.ok(Math.abs(flippers[1].active.y-362.04)<.2);
const plunger=a.components.find(c=>c.type===1001);
assert.ok(Math.abs(plunger.bounds.cx-329.5)<.1);
assert.ok(Math.abs(plunger.bounds.cy-402)<.1);
const world=fs.readFileSync("renderer3d/world.js","utf8");
assert.ok(world.includes("window.fitCollisionVisual("));
assert.ok(world.includes("window.projectWorld("));
assert.ok(world.includes("plungerVisual.cy"));
assert.ok(!world.includes("for(const c of layout.components.filter(c=>[1006,1017,1019].includes(c.type)&&c.bounds))"));
console.log("PASS: 7 bumper center fits <1.35px, calibrated original flipper base/tips, plunger, component typing.");
console.log(JSON.stringify({actual,flippers,plunger:plunger.bounds},null,2));
