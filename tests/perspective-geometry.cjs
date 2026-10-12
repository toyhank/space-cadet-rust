const assert=require("node:assert/strict"),fs=require("node:fs");
(async()=>{
  const {readOriginalArt}=await import("../renderer3d/original-art.js");
  const {detectTablePerspective}=await import("../renderer3d/table-perspective.js");
  const b=fs.readFileSync("pinball.dat"),a=readOriginalArt(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));
  const g=detectTablePerspective(a.table);
  assert.equal(g.width,365);
  assert.ok(g.height>=418 && g.height<=429);
  assert.ok(g.top.left.x>=65&&g.top.left.x<=80);
  assert.ok(g.top.right.x>=285&&g.top.right.x<=300);
  assert.ok(g.bottom.left.x>=0&&g.bottom.left.x<=7);
  assert.ok(g.bottom.right.x>=355&&g.bottom.right.x<=364);
  const topWidth=g.top.right.x-g.top.left.x;
  const bottomWidth=g.bottom.right.x-g.bottom.left.x;
  assert.ok(bottomWidth/topWidth>1.57&&bottomWidth/topWidth<1.70);
  assert.ok(g.left.length>30 && g.right.length===g.left.length);
  for(let i=1;i<g.left.length;i++){
    assert.ok(g.left[i].y>g.left[i-1].y);
    assert.ok(g.right[i].y>g.right[i-1].y);
    assert.ok(g.left[i].x<g.right[i].x);
  }
  const world=fs.readFileSync("renderer3d/world.js","utf8");
  assert.ok(world.includes('controls.enableRotate=!faithful'));
  assert.ok(world.includes('detectTablePerspective(originalArt.table)'));
  assert.ok(world.includes('camera.position.set(0,36,0)'));
  console.log("PASS: Original 221px top / 361px bottom trapezoid identified; no double camera perspective in faithful mode.");
})().catch(e=>{console.error(e);process.exitCode=1;});
