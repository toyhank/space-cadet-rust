import assert from "node:assert/strict";
import fs from "node:fs";
import {VPXNativeCCD} from "../vpx/vpx-native.js";
import {VPXCollisionWorld} from "../vpx/collision-world.js";
import {CadetGame} from "../vpx/gameplay.js";
const wasm=Buffer.from(fs.readFileSync("vpx/native/vpx_ccd.wasm.base64","utf8"),"base64");
const {instance}=await WebAssembly.instantiate(wasm);
const native=new VPXNativeCCD(instance);
assert.equal(instance.exports.vpx_version(),2);
const makeFlipper=(side)=>({
  name:side==="left"?"LeftFlipper":"RightFlipper",
  x:side==="left"?.187:.3455,z:.90757,
  baseRadius:.0111,endRadius:.0063,length:.0619,
  start:side==="left"?2.14675:4.13643,
  end:side==="left"?1.22173:5.06145,
  restitution:.85,friction:.25,
  strength:3600,mass:1,returnRatio:.04,rampUp:1,
  torqueDamping:1,torqueDampingAngle:0
});
const fixture=makeFlipper("left");
fixture.angle=fixture.start;fixture.omega=0;fixture.nativeTorque=0;
fixture.nativeShape=.0011; // exact shape in the native C++ ctypes fixture
const reference=[
  [2.130117416381836,-8.55374813079834,-1291.885009765625],
  [2.042203664779663,-31.363739013671875,-2583.769775390625],
  [1.8283600807189941,-65.00847625732422,-3100.524169921875]
];
for(const values of reference){
  native.stepFlipper(fixture,true,1/240);
  for(let j=0;j<3;j++)
    assert.ok(Math.abs([fixture.angle,fixture.omega,fixture.nativeTorque][j]-values[j])<.0005,
      "WASM flipper step agrees with original C++ compiler native fixture");
}
const collisionFlipper={...fixture,omega:reference[2][1]};
const sphere={vx:0,vz:.8,wy:0,r:.0122};
assert.equal(native.collideFlipper(sphere,collisionFlipper,.018,-.04,0,-1),true);
assert.ok(Math.abs(sphere.vx-(-.5248389840126038))<.0001);
assert.ok(Math.abs(sphere.vz-(-1.373603105545044))<.0001);
assert.ok(Math.abs(sphere.wy-(-107.54898071289062))<.01);
assert.ok(collisionFlipper.omega!==reference[2][1],
  "VPX transfers ball impact back to flipper angular momentum");

const p=new VPXCollisionWorld({version:1,segments:[],circles:[],
  flippers:[makeFlipper("left"),makeFlipper("right")],
  triggers:[],kickers:[],ramps:[]},{nativeCCD:native});
const commands={left:true,right:true},
  fake={flippers:commands,elapsed:1,tilted:false,timeSinceHit:new Map(),send(){}};
for(const side of ["left","right"]){
  const f=p.flippers.find(x=>x.name.toLowerCase()===side+"flipper");
  p.reset();
  for(let t=0;t<3;t++)p.updateFlippers(1/240,commands);
  const x=f.x+Math.sin(f.angle)*f.length*.55;
  const z=f.z-Math.cos(f.angle)*f.length*.55;
  const ball={id:3,x,z:z-.017,y:.0122,r:.0122,vx:0,vz:.8,vy:0};
  p.solveFlippers(ball,fake);
  assert.ok(ball.vz<-.65,side+" native active swing should kick UPFIELD");
  assert.ok(p.stats.nativeFlipperHits>0,"C++ flipper collision used");
  assert.ok(Number.isFinite(ball.wy),"VPX friction produces ball spin");
  assert.equal(ball.vy,0,"No artificial vertical rocket impulse");
  p.reset();
  for(let t=0;t<120;t++)p.updateFlippers(1/240,commands);
  assert.ok(Math.abs(f.angle-f.end)<.0001,"held bat reaches original end angle");
  const angle=f.angle;
  for(let t=0;t<60;t++)p.updateFlippers(1/240,commands);
  assert.ok(Math.abs(f.angle-angle)<.0001,"holding must not repeatedly swing");
  commands[side]=false;
  for(let t=0;t<120;t++)p.updateFlippers(1/240,commands);
  assert.ok(Math.abs(f.angle-f.start)<.0001,"released bat returns to original rest angle");
  commands[side]=true;
}
if(fs.existsSync("assets/vpx-local/space-cadet.physics.json")){
  const data=JSON.parse(fs.readFileSync("assets/vpx-local/space-cadet.physics.json","utf8"));
  for(const mode of ["idle","cycled"]){
    const game=new CadetGame({}, {physics:data,nativeCCD:native});
    let flipperHits=0;
    for(let i=0;i<14000&&!game.over;i++){
      const pressed=mode==="cycled"&&i%22<5;
      game.setFlipper("left",pressed);game.setFlipper("right",pressed);
      game.tick(.025);
      game.consumeEvents();
      if(game.plungerLoaded&&!game.over)game.launch(.83);
      flipperHits=game.physics.stats.nativeFlipperHits||0;
    }
    assert.equal(game.over,true,mode+" full three-ball simulation must finish");
    assert.ok(game.physics.stats.nativeHits>0,"WASM native wall CCD still active");
    console.log("PASS JP v4.3 "+mode+" 3-ball match; native flipper hits",flipperHits);
  }
}
console.log("PASS native VPX motor torque/rotational inertia/ball recoil/friction C++ WASM fixtures and two-sided flipper gameplay");
