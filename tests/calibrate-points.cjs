const fs=require("node:fs"),{datMetadata}=require("../renderer3d/dat-geometry.js");
const b=fs.readFileSync("pinball.dat"),a=datMetadata(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));
const A=-.913545,B=.406737,F=3.791398,G=24.675402,D=-400.0007;
function p(x,y,z=0){const depth=-B*y+A*z+G;return [+(x*D/depth+183).toFixed(2),+((A*y+B*z+F)*D/depth+238).toFixed(2)]}
for(const [name,xyz] of [["FLIP L BASE",[2.4888,12.0631]],["FLIP L IDLE",[.9613,13.131]],["FLIP L ACTIVE",[.9613,11.0066]],["FLIP R BASE",[-2.489,12.0631]],["FLIP R IDLE",[-.961,13.131]],["BUMP 1",[.008,-3.72]],["BUMP 2",[-1.3775,-6.618]],["BUMP 3",[1.2511,-5.9605]],["BUMP 4",[5.7695,-10.9551]],["BUMP 5",[5.28,4]],["BUMP 6",[7.14,3.5]],["BUMP 7",[6.4513,4.9079]]])console.log(name,"at z0:",p(...xyz),"at z1:",p(...xyz,1));
console.log("SPRITE BOXES",a.components.filter(c=>[1003,1004,1005].includes(c.type)).map(c=>({name:c.name,b:c.bounds})));
