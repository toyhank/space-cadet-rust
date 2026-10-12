const assert=require("node:assert/strict");
const fs=require("node:fs");
const {datMetadata,projectBumperProfile}=require("../renderer3d/dat-geometry.js");
const b=fs.readFileSync("pinball.dat");
const layout=datMetadata(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const bumpers=layout.components.filter(c=>c.type===1005);
assert.equal(bumpers.length,7);
let offsets=[];
for(const c of bumpers){
  const p=projectBumperProfile(layout.projection,c.circle,c.bounds);
  assert.ok(p, c.name+" profile");
  assert.ok(p.fitError<1.35,c.name+" must align with original bitmap");
  assert.ok(p.topHeight>.40,c.name+" cap should have real height");
  const dy=p.center.top.y-p.center.base.y;
  assert.ok(dy<-4&&dy>-14,c.name+" cap must project UP from base, dy="+dy);
  const xs=p.lip.map(v=>v.x),ys=p.lip.map(v=>v.y);
  const width=Math.max(...xs)-Math.min(...xs);
  const height=Math.max(...ys)-Math.min(...ys);
  assert.ok(height<width,c.name+" projected top must be an ELLIPSE, not circular");
  assert.ok(width<=c.bounds.w+1,c.name+" cap wider than original art");
  assert.ok(p.lip.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)));
  offsets.push([c.name,+dy.toFixed(2),+width.toFixed(2),+height.toFixed(2)]);
}
assert.ok(offsets.slice(4).every((v)=>v[1]<-10),
  "Three elevated lower-left bumpers must lean farther upward than top set");
console.log("PASS: 7 bumper caps project toward table TOP; elliptical tops and art bounds agree.");
console.log("name,dy,diameterX,diameterY",JSON.stringify(offsets));
