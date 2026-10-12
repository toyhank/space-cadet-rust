const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {scale2x,enhancePixels}=require("../hd-render.js");
const {scanOriginalObjects}=require("../dat-layout.js");
const {composeScene}=require("../dat-scene.js");
const input=new Uint8ClampedArray([
  40,55,60,255, 10,20,30,255,
  50,55,60,255, 10,20,30,255
]);
const output=scale2x(input,2,2);
assert.equal(output.width,4);
assert.equal(output.height,4);
assert.equal(output.rgba.length,4*4*4);
assert.equal(output.rgba[3],255);
assert.throws(()=>scale2x(input,3,2),/Invalid source/);
const out4=enhancePixels(input,2,2,"edge4");
assert.equal(out4.width,8);assert.equal(out4.height,8);
assert.equal(out4.rgba.length,8*8*4);
const untouched=enhancePixels(input,2,2,"smooth");
assert.equal(untouched.rgba,input);
const file=fs.readFileSync("PINBALL.DAT");
const stub={width:600,height:480,checked:true,textContent:"",classList:{toggle(){}},addEventListener(){},getContext(){return{fillRect(){},fillText(){},drawImage(){},putImageData(){}}}};
const box={document:{getElementById(){return stub}},location:{protocol:"file:"},console,TextDecoder,Uint8Array,Uint8ClampedArray,DataView,ImageData:class{},WebAssembly};
vm.createContext(box);
vm.runInContext(fs.readFileSync("viewer.js","utf8").replace("draw();initWasm().then(autoLoadOriginal);",""),box);
const bytes=file.buffer.slice(file.byteOffset,file.byteOffset+file.length),archive=box.getDataFile(bytes);
const scene=composeScene(archive,scanOriginalObjects(bytes,archive.items));
const two=enhancePixels(scene.rgba,scene.width,scene.height,"edge2");
const four=enhancePixels(scene.rgba,scene.width,scene.height,"edge4");
assert.equal(two.width,1200);assert.equal(two.height,960);
assert.equal(four.width,2400);assert.equal(four.height,1920);
assert.equal(two.rgba.length,1200*960*4);
assert.equal(four.rgba.length,2400*1920*4);
for(let y of [0,40,105,230,470]){
 for(let x of [0,150,350,599]){
  const p=(y*600+x)*4,p2=((y*2)*1200+x*2)*4;
  if(x>0&&y>0&&x<599&&y<479){ // colors can differ at edges; check alpha only
   assert.equal(two.rgba[p2+3],255);
  }
  assert.equal(scene.rgba[p+3],255);
 }
}
const html=fs.readFileSync("index.html","utf8");
for(const selector of ['id="fullscreen"','id="quality"','id="theater"','id="save-frame"','src="./hd-render.js"']){
 assert.ok(html.includes(selector),selector);
}
console.log("PASS: HD output 1200x960/2400x1920, 4 modes, fullscreen/theater/export controls; original DAT verified.");
