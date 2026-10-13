import fs from "node:fs";
import assert from "node:assert/strict";
import {VPXNativeCCD} from "../vpx/vpx-native.js";
import {VPXCollisionWorld} from "../vpx/collision-world.js";
import {CadetGame} from "../vpx/gameplay.js";

const base64=fs.readFileSync("vpx/native/vpx_ccd.wasm.base64","utf8").replace(/\s/g,"");
const wasm=Buffer.from(base64,"base64");
assert.equal(wasm.length,3203,"committed WASM must match the compiled C++ prototype");
assert.ok(WebAssembly.validate(wasm));
const {instance}=await WebAssembly.instantiate(wasm);
const ccd=new VPXNativeCCD(instance);
const wall={x1:.10,z1:0,x2:.10,z2:.2,
  source:{name:"TestWall",type:"Wall",restitution:.75,friction:.25,bottom:0,top:.05}};
const ball={id:1,x:.05,z:.1,y:.0122,r:.0122,vx:1,vz:0,vy:0,wx:0,wy:0,wz:0};
const hit=ccd.lineTime(ball,wall,.1);
assert.ok(hit);
assert.ok(Math.abs(hit.time-.037800002843141556)<1e-7,
  "TOI must reproduce the native C++ VPX fixture in seconds");
assert.ok(Math.abs(hit.nx+1)<1e-6);
assert.ok(Math.abs(hit.nz)<1e-6);
assert.equal(ccd.lineTime({...ball,vx:-1},wall,.1),null,"receding ball does not collide");
assert.equal(ccd.lineTime({...ball,z:.3},wall,.1),null,"missed endpoint does not collide");
assert.equal(ccd.lineTime({...ball,y:.0922},wall,.1),null,"elevated ball clears wall");
assert.equal(ccd.lineTime(ball,wall,.01),null,"collision outside requested frame");
// These expected values are from the same vpx_ccd.cpp compiled natively with
// clang++ -O3 and invoked via ctypes (GLB metres and VPX VPT conversion).
const bounceBall={...ball,vx:1,vz:.2};
ccd.bounce(bounceBall,hit,wall.source);
assert.ok(Math.abs(bounceBall.vx-(-.75))<1e-6);
assert.ok(Math.abs(bounceBall.vz-.1428571492433548)<1e-5);
assert.ok(Math.abs(bounceBall.wy-11.709602355957031)<1e-4);
// A discrete resolver alone would miss this fast ball (its final position
// is > one ball radius beyond the wall); the real VPX line CCD must hit.
const geometry={version:1,segments:[{
  name:"TestWall",type:"Wall",closed:false,
  points:[[.1,0],[.1,.2]],bottom:0,top:.05,
  restitution:.75,friction:.25
}],circles:[],flippers:[],triggers:[],kickers:[],ramps:[]};
const fallback=new VPXCollisionWorld(geometry);
const highspeed={...ball,x:.15,vx:2};
const events=[],game={send:(type,data)=>events.push({type,...data})};
assert.equal(fallback.resolveNativeWallSweep(highspeed,.05,.1,.0122,.05,game),false);
assert.ok(highspeed.x>.1);
const native=new VPXCollisionWorld(geometry,{nativeCCD:ccd});
const fast={...ball,x:.15,vx:2,vz:0,vy:0};
assert.equal(native.resolveNativeWallSweep(fast,.05,.1,.0122,.05,game),true);
assert.ok(fast.x<.1,"high speed CCD must stop ball passing through static wall");
assert.ok(fast.vx<0,"ball bounces from correct normal side");
assert.equal(native.stats.nativeHits,1);
assert.ok(events.some(e=>e.type==="wallCCD"));
assert.ok(Number.isFinite(fast.wy),"VPX spin impulse is applied");
// The previous prototype used two-sided CCD for the right launcher trough,
// reversed every ball and trapped an entire game indefinitely. Guard against
// regressions with full-length real JP VPX table simulations in local runs.
if(fs.existsSync("assets/vpx-local/space-cadet.physics.json")){
  const local=JSON.parse(fs.readFileSync("assets/vpx-local/space-cadet.physics.json","utf8"));
  for(const style of ["idle","cycled"]){
    const match=new CadetGame({}, {physics:local,nativeCCD:ccd});
    for(let i=0;i<12000&&!match.over;i++){
      const active=style==="cycled"&&i%24<7;
      match.setFlipper("left",active);
      match.setFlipper("right",active);
      match.tick(.025);
      match.consumeEvents();
      if(match.plungerLoaded&&!match.over)match.launch(.83);
    }
    assert.equal(match.over,true,style+" game should end all three balls (no launcher wall traps)");
    assert.ok(match.physics.stats.nativeHits>0,style+" must actually execute VPX C++ wall CCD");
    assert.ok(match.physics.stats.nativeHits<10000,style+" should not chatter on a wall every physics tick");
    console.log("PASS full JP v4.3 game "+style+" with VPX WASM CCD: "+
      match.physics.stats.nativeHits+" actual native wall hits, score "+match.score);
  }
}
console.log("PASS compiled GPL VPX C++ WASM: line TOI, endpoint/height/side checks, native C++ wall restitution + angular friction parity, real swept wall no-tunneling, JS fallback.");
