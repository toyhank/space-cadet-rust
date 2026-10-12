// Visual test harness: write a PNG data URI to stdout without creating files.
const fs=require("node:fs"),vm=require("node:vm"),zlib=require("node:zlib");
const {scanOriginalObjects}=require("../dat-layout.js"),{composeScene}=require("../dat-scene.js");
const s={width:600,height:480,checked:true,classList:{toggle(){}},addEventListener(){},getContext(){return{fillRect(){},fillText(){},drawImage(){}}}};
const env={document:{getElementById(){return s}},location:{protocol:"file:"},console,TextDecoder,Uint8Array,Uint8ClampedArray,DataView,ImageData:class{},WebAssembly};vm.createContext(env);
vm.runInContext(fs.readFileSync("viewer.js","utf8").replace("draw();initWasm().then(autoLoadOriginal);",""),env);
const file=fs.readFileSync("PINBALL.DAT");
const bytes=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength);
const archive=env.getDataFile(bytes);
const layer=scanOriginalObjects(bytes,archive.items);
const scene=composeScene(archive,layer);
function crc32(data){
 let c=0xffffffff;
 for(const b of data){c^=b;for(let j=0;j<8;j++)c=(c&1)?(c>>>1)^0xedb88320:c>>>1;}
 return (c^0xffffffff)>>>0;
}
function chunk(kind,data){
 const k=Buffer.from(kind,"ascii"),size=Buffer.alloc(4);size.writeUInt32BE(data.length);
 const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([k,data])));
 return Buffer.concat([size,k,data,crc]);
}
const W=200,H=160;
const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=6;
const stride=W*4;const scanline=Buffer.alloc(H*(stride+1));
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const from=((y*3)*scene.width+x*3)*4;const to=y*(stride+1)+1+x*4;
 for(let k=0;k<4;k++)scanline[to+k]=scene.rgba[from+k];
}
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",zlib.deflateSync(scanline,{level:9})),chunk("IEND",Buffer.alloc(0))]);
process.stdout.write(png.toString("base64"));
