const fs=require("node:fs");
const {datMetadata}=require("../renderer3d/dat-geometry.js");
const src=fs.readFileSync("pinball.dat"),v=new DataView(src.buffer,src.byteOffset,src.length),bytes=new Uint8Array(src.buffer,src.byteOffset,src.length);
let p=183+v.getUint16(181,true);const groups=[];
for(let g=0;g<v.getUint16(175,true);g++){
 let name="",arr=[],count=bytes[p++];
 for(let i=0;i<count;i++){
   const t=bytes[p++];let n;
   if(t===0||t===2)n=2;else if(t===13)n=0;else {n=v.getUint32(p,true);p+=4}
   if(t===3)name=src.subarray(p,p+n).toString("latin1").split("\0")[0];
   if(t===11&&n%4===0)arr.push(Array.from({length:n/4},(_,j)=>v.getFloat32(p+j*4,true)));
   p+=n;
 }
 groups.push({name,arr});
}
for(const n of ["camera_info","table","a_flip1","a_flip2","a_bump1","a_bump2","a_bump3","a_bump4","a_bump5","a_bump6","a_bump7","a_plunger"]){
 const g=groups.find(x=>x.name===n);if(!g)continue;
 console.log("\nGROUP",n);
 console.log(g.arr.filter(a=>["camera_info","table"].includes(n)||[600,601,700,701,800,801,802].includes(Math.round(a[0]))).map(a=>a.map(x=>Number(x.toFixed(4)))));
}
