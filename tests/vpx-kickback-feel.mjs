import assert from "node:assert/strict";
import fs from "node:fs";
import {VPXCollisionWorld} from "../vpx/collision-world.js";
import {CadetGame} from "../vpx/gameplay.js";

// Deterministic, public CI test for the critical physical difference
// between a MOVING flipper stroke and a HELD flipper.
const flippers=[
  {name:"LeftFlipper",x:.187,z:.90757,length:.0619,
    baseRadius:.0111,endRadius:.0063,start:2.14675,end:1.22173,restitution:.85},
  {name:"RightFlipper",x:.34551,z:.90757,length:.0619,
    baseRadius:.0111,endRadius:.0063,start:4.13643,end:5.06145,restitution:.85}
];
const p=new VPXCollisionWorld({
  version:1,segments:[],circles:[],flippers,triggers:[],kickers:[],ramps:[]});
for(const side of ["left","right"]){
  const physical=p.flippers.find(f=>f.name.toLowerCase()===side+"flipper");
  const fake={flippers:{left:+(side==="left"),right:+(side==="right")},
    timeSinceHit:new Map(),elapsed:5,tilted:false,send(){}};
  const touch=()=>({
    id:7,x:physical.x+Math.sin(physical.angle)*physical.length*.55,
    z:physical.z-Math.cos(physical.angle)*physical.length*.55-.017,
    vx:0,vz:.8,vy:0,y:.0122,r:.0122
  });
  p.reset();
  for(let i=0;i<3;i++)p.updateFlippers(1/240,fake.flippers);
  const swung=touch();
  p.solveFlippers(swung,fake);
  assert.ok(swung.vz<-.90,side+" moving flipper must propel ball UPFIELD");
  assert.ok(Math.hypot(swung.vx,swung.vz)>.95,
    side+" moving flipper should ADD meaningful shot energy");
  assert.ok(swung.vy>0&&swung.vy<.45,
    side+" coil should lift ball only slightly (not launch a vertical rocket)");
  p.reset();
  for(let i=0;i<90;i++)p.updateFlippers(1/240,fake.flippers);
  const held=touch();
  p.solveFlippers(held,fake);
  assert.equal(held.vy,0,side+" held flipper must not add air energy");
  assert.ok(Math.hypot(held.vx,held.vz)<.8,
    side+" held flipper only supplies ordinary rubber restitution");
}
// Local integration: left and right kicker impulse plungers start at their
// original VPX locations. Left is obstructed by a low bumper and must clear
// that bumper with a real Y trajectory, not teleport through the rail.
if(fs.existsSync("assets/vpx-local/space-cadet.physics.json")){
  const d=JSON.parse(fs.readFileSync("assets/vpx-local/space-cadet.physics.json"));
  for(const [side,x,z,top] of [
    ["left",.03905227267,.895770341425,.50],
    ["right",.448595022925,.89465322085,.20]
  ]){
    const game=new CadetGame({}, {physics:d});
    game.elapsed=10;game.plungerLoaded=false;
    game.saverUntil=-100;
    const ball=game.spawnBall(x,z,0,0);
    let fired=0,minimum=2,highest=0,landed=0;
    for(let i=0;i<840;i++){
      game.tick(.008);
      for(const e of game.consumeEvents()){
        if(e.type==="kickbackFire"&&e.side===side)fired++;
        if(e.type==="rampLand"&&e.name==="Ramp009"&&side==="left")landed++;
      }
      if(game.activeBalls.includes(ball)){
        minimum=Math.min(minimum,ball.z);
        highest=Math.max(highest,ball.y);
      }else break;
    }
    assert.ok(fired>=1,side+" kicker auto-fires after the 1.5s cup hold");
    assert.ok(minimum<top,side+" impulse must pass the obstacle and go UPFIELD");
    if(side==="left"){
      assert.ok(highest>.065,
        "left kicker should physically lift ball over Bumper7");
      assert.ok(landed>=1,
        "left kicker should actually put ball onto the upper VPX ramp");
    }
    console.log("PASS "+side+" kicker: minZ="+minimum.toFixed(3)+
      ", maxY="+highest.toFixed(3)+", ramp landings="+landed);
  }
  for(const [side,x,z,vx] of [
    ["Leftslingshot",.157,.767,.4],
    ["Rightslingshot",.373,.767,-.4],
    ["Leftslingshot2",.133,.382,.4]
  ]){
    const game=new CadetGame({}, {physics:d});
    game.elapsed=3;game.plungerLoaded=false;
    const ball=game.spawnBall(x,z,vx,.4);
    game.consumeEvents();
    game.physics.solveEdges(ball,game);
    const events=game.consumeEvents();
    assert.ok(events.some(e=>e.type==="slingFire"&&e.name===side),
      side+" VPX coil must ACTUATE, not merely score");
    assert.ok(ball.vz<=(/2$/.test(side)?-1.14:-1.57),
      side+" slingshot must kick upfield even after two wall-solver passes");
    assert.equal(game.score,500,
      side+" awards original JP VBS sling score");
  }
  console.log("PASS original left/right and upper slingshot solenoid kick impulses.");
}else console.log("SKIP local JP VPX asset integration; public flipper tests passed.");
console.log("PASS moving vs held flipper energy for BOTH sides.");
