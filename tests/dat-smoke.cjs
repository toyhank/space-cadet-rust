// Dependency-free fixture test for original PARTOUT(4.0) DAT parsing.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("viewer.js","utf8");
const stub={width:600,height:416,checked:true,textContent:"",classList:{toggle(){}},addEventListener(){},getContext(){return{fillRect(){},fillText(){},drawImage(){}}}};
const sandbox={
 document:{getElementById(){return stub;}},
 location:{protocol:"file:"},console,TextDecoder,Uint8Array,Uint8ClampedArray,DataView,
 ArrayBuffer,ImageData:class {},WebAssembly,
};
vm.createContext(sandbox);
vm.runInContext(source.replace("draw();initWasm();",""),sandbox,{filename:"viewer.js"});
function fixture(){
  const b=Buffer.alloc(183); b.write("PARTOUT(4.0)RESOURCE",0,"ascii");
  b.writeUInt16LE(1,175);
  const name=Buffer.from("background\0");
  const palette=Buffer.alloc(1024);palette.set([11,22,33,0],10*4);
  const bitmap=Buffer.alloc(22);
  bitmap[0]=0;bitmap.writeInt16LE(2,1);bitmap.writeInt16LE(2,3);
  bitmap.writeUInt32LE(8,9);bitmap[13]=2;
  bitmap.set([10,0,0,0,0,10,0,0],14);
  function field(type,payload) {const h=Buffer.alloc(5);h[0]=type;h.writeUInt32LE(payload.length,1);return Buffer.concat([h,payload]);}
  return Buffer.concat([b,Buffer.from([3]),field(3,name),field(5,palette),field(1,bitmap)]);
}
const test=fixture();
const view=sandbox.getDataFile(test.buffer.slice(test.byteOffset,test.byteOffset+test.byteLength));
assert.equal(view.groups,1);
assert.equal(view.items.length,1);
assert.equal(view.items[0].name,"background");
assert.equal(view.items[0].w,2);
assert.deepEqual([...view.items[0].rgba.slice(4,8)],[33,22,11,255]);
const damaged=Buffer.from(test);damaged[0]=0;
assert.throws(()=>sandbox.getDataFile(damaged.buffer.slice(damaged.byteOffset,damaged.byteOffset+damaged.byteLength)),/Not a Space Cadet/);
const short=Buffer.from(test.subarray(0,test.length-1));
assert.throws(()=>sandbox.getDataFile(short.buffer.slice(short.byteOffset,short.byteOffset+short.byteLength)),/Truncated/);
// One spliced sample from the documented signed-advance/run/depth/color format.
const spliced=Buffer.from([0,0,1,0,0x34,0x12,10,255,255]);
const pixels=sandbox.unpackSpliced({w:2,h:2,res:0,pixels:spliced});
assert.deepEqual([...pixels],[10,0,0,0]);
// A real, openly licensed data file verifies that field offsets match the engine.
const base64=Array.from({length:21},(_,i)=>fs.readFileSync("assets/open-cadet."+String(i).padStart(2,"0")+".b64","utf8")).join("");
const dat=Buffer.from(base64,"base64");
assert.equal(dat.byteLength,911260);
const live=sandbox.getDataFile(dat.buffer.slice(dat.byteOffset,dat.byteOffset+dat.byteLength));
assert.equal(live.groups,541);
const table=live.items.find(x=>x.name==="table");
const bg=live.items.find(x=>x.name==="background");
assert.ok(live.items.length>50);
assert.deepEqual([table.w,table.h,table.x,table.y],[365,470,137,2]);
assert.deepEqual([bg.w,bg.h,bg.x,bg.y],[203,394,386,12]);
console.log("PASS: synthetic DAT, broken input and real CC0 DAT; "+live.items.length+" bitmap sprites decoded.");
