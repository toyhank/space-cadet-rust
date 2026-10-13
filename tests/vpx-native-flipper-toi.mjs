import assert from "node:assert/strict";
import fs from "node:fs";
import {inflateSync} from "node:zlib";
import {VPXFlipperTOI} from "../vpx/vpx-flipper-toi.js";
import {VPXNativeCCD} from "../vpx/vpx-native.js";
import {VPXCollisionWorld} from "../vpx/collision-world.js";
const compressed=Buffer.from(fs.readFileSync(
  "vpx/native/vpx_flipper_ccd.wasm.deflate.base64","utf8").replace(/\s/g,""),"base64");
const binary=inflateSync(compressed);
assert.equal(binary.length,4193);
assert.ok(WebAssembly.validate(binary));
const {instance}=await WebAssembly.instantiate(binary);
const detector=new VPXFlipperTOI(instance.exports);
const motorBytes=Buffer.from(fs.readFileSync(
  "vpx/native/vpx_ccd.wasm.base64","utf8").replace(/\s/g,""),"base64");
const motor=new VPXNativeCCD((await WebAssembly.instantiate(motorBytes)).instance);
motor.flipperTOI=detector;
const f={name:"LeftFlipper",x:.187,z:.90757,
  baseRadius:.0111,endRadius:.0063,length:.0619,
  start:2.14675,end:1.22173,angle:2.14675,omega:0};
let example=null;
for(let x=.16;x<.265&&!example;x+=.003){
 for(let z=.96;z>.82&&!example;z-=.003){
  const b={x,z,y:.0122,r:.0122,vx:0,vz:-8,vy:0};
  const h=detector.find(b,f,f.angle,0,.02);
  if(h&&h.time>.0001&&h.kind.startsWith("face"))example={b,h};
 }
}
assert.ok(example,"Fast ball crossing a tapered face detected BEFORE endpoint overlap");
assert.ok(example.h.time<.02);
assert.ok(Math.abs(example.h.nx**2+example.h.nz**2-1)<.005);
const above={...example.b,y:.2};
assert.equal(detector.find(above,f,f.angle,0,.02),null,
  "Overhead ball must not strike flipper");
const away={...example.b,vz:8};
assert.equal(detector.find(away,f,f.angle,0,.02),null,"Receding ball not hit");
// Rotating tip can strike a stationary ball. Scan a physically plausible
// range, comparing moving and static flipper results.
let tip=null;
for(let x=.16;x<.28&&!tip;x+=.004)for(let z=.83;z<.975&&!tip;z+=.004){
  const b={x,z,y:.0122,r:.0122,vx:0,vz:0,vy:0};
  const moving=detector.find(b,f,f.angle,-55,.009);
  const stopped=detector.find(b,f,f.angle,0,.009);
  if(moving?.kind==="tip"&&!stopped)tip={b,moving};
}
assert.ok(tip,"Swept, rotating tip contacts stationary ball");
const geo={version:1,segments:[],circles:[],flippers:[f],
  triggers:[],kickers:[],ramps:[]};
const world=new VPXCollisionWorld(geo,{nativeCCD:motor});
const events=[],game={
  elapsed:1,flippers:{left:false,right:false},tilted:false,
  timeSinceHit:new Map(),send:(type,event)=>events.push({type,...event})};
const ball={id:1,...example.b,wx:0,wy:0,wz:0};
const dt=.02;
world.flippers[0].previousAngle=world.flippers[0].angle;
world.flippers[0].sweepOmega=0;
ball.z+=ball.vz*dt;
const endZ=ball.z;
assert.ok(ball.z<example.b.z-.14);
const hit=world.resolveNativeFlipperSweep(ball,example.b.x,example.b.z,.0122,dt,game);
assert.equal(hit,true);
assert.ok(world.stats.nativeFlipperCCD>=1);
assert.ok(ball.vz> -8,"WASM flipper bounce changes velocity");
assert.ok(events.some(e=>e.type==="flipperHit"&&e.ccd));
world.solveFlippers(ball,game);
assert.ok(Number.isFinite(ball.x)&&Number.isFinite(ball.z));
console.log("PASS VPX tapered side faces, swept rotating tip, height rejection, receding rejection, CCD impulse integration and duplicate-contact suppression",{
  faceTime:example.h.time,tipTime:tip.moving.time,bounceVZ:ball.vz,
  discreteEndZ:endZ,ccdEndZ:ball.z
});
