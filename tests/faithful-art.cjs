const fs=require("node:fs"),assert=require("node:assert/strict"),vm=require("node:vm");
(async()=>{
  const {readOriginalArt}=await import("../renderer3d/original-art.js");
  const bin=fs.readFileSync("pinball.dat"),bytes=bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.length);
  const original=readOriginalArt(bytes);
  assert.equal(original.table.width,365);
  assert.equal(original.table.height,470);
  assert.equal(original.background.width,203);
  assert.equal(original.background.height,394);
  assert.equal(original.background.x,386);
  assert.equal(original.background.y,12);
  const stub={checked:true,addEventListener(){},classList:{toggle(){}},getContext(){return{fillRect(){},fillText(){},drawImage(){},putImageData(){}}}};
  const sandbox={document:{getElementById(){return stub;}},location:{protocol:"file:"},console,TextDecoder,Uint8Array,Uint8ClampedArray,DataView,ArrayBuffer,ImageData:class{},WebAssembly};
  vm.createContext(sandbox);
  const code=fs.readFileSync("viewer.js","utf8");
  vm.runInContext(code.replace("draw();initWasm().then(autoLoadOriginal);",""),sandbox);
  const ref=sandbox.getDataFile(bytes);
  for(const [kind,bitmap] of Object.entries(original)){
    const existing=ref.items.find(x=>x.name===kind);
    assert.ok(existing,kind);
    assert.deepEqual([...bitmap.rgba],[...existing.rgba]);
  }
  const html=fs.readFileSync("3d.html","utf8");
  assert.ok(html.includes('class="hide-panel"'));
  assert.ok(html.includes('id="toggle-art"'));
  assert.ok(fs.readFileSync("renderer3d/main.js","utf8").includes('readOriginalArt(buffer)'));
  console.log("PASS: original table + scoreboard RGBA exactly match legacy parser, faithful 3D mode active.");
})().catch(err=>{console.error(err);process.exitCode=1});
