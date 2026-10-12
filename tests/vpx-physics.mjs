import assert from "node:assert/strict";
import fs from "node:fs";
import {CadetGame} from "../vpx/gameplay.js";
import {VPXCollisionWorld} from "../vpx/collision-world.js";
const data=JSON.parse(fs.readFileSync("assets/vpx-local/space-cadet.physics.json"));
assert.equal(data.version,1);
assert.equal(data.unit,.00053975);
assert.equal(data.circles.length,7);
assert.equal(data.flippers.length,2);
assert.equal(data.segments.filter(x=>x.type==="Wall").length,55);
assert.equal(data.segments.filter(x=>x.type==="HitTarget").length,22);
assert.equal(data.ramps.length,4);
assert.equal(data.kickers.length,6);
assert.ok(data.triggers.some(t=>t.name==="RightKickerRest"));
const world=new VPXCollisionWorld(data);
assert.ok(world.edges.length>430);
assert.ok(world.edges.some(e=>e.source.type==="HitTarget"));
assert.ok(!world.edges.some(e=>e.source.name==="Gate006"),
  "one-way VPX hinges must not become always-closed hard walls");
assert.ok(!world.edges.some(e=>e.source.name==="Wall051"),
  "wall above the ball's floor contact height must be excluded");
const lf=world.flippers.find(x=>x.name==="LeftFlipper");
const rf=world.flippers.find(x=>x.name==="RightFlipper");
assert.ok(Math.sin(lf.start)>0&&Math.sin(rf.start)<0,
  "flipper tips must point toward table center");
world.updateFlippers(0.05,{left:1,right:1});
assert.ok(lf.angle<lf.start);
assert.ok(rf.angle>rf.start);
for(let i=0;i<20;i++)world.updateFlippers(.02,{left:1,right:1});
assert.ok(Math.abs(lf.angle-lf.end)<.001);
assert.ok(Math.abs(rf.angle-rf.end)<.001);
world.updateFlippers(.05,{left:0,right:0});
assert.ok(lf.angle>lf.end);
const little={
 version:1,segments:[{name:"testWall",type:"Wall",points:[[.1,0],[.1,.3]],
   closed:false,bottom:0,top:.03,restitution:.7},
   {name:"high",type:"Wall",points:[[.2,0],[.2,.3]],
   closed:false,bottom:.1,top:.2,restitution:.7}],
 circles:[],flippers:[],triggers:[],kickers:[],ramps:[]
};
const physics=new VPXCollisionWorld(little);
assert.equal(physics.edges.length,1);
const ball={id:1,x:.09,z:.15,vx:1,vz:0,r:.0122};
const fake={hit(){},send(){},timeSinceHit:new Map(),elapsed:1,flippers:{},tilted:false,
 activeBalls:[ball],onDrain(){}};
physics.step(fake,.005);
assert.ok(ball.vx<0,"real line-segment collision must reflect approach speed");
assert.ok(ball.x<.1,"contact must not pass through wall");
const triggerData={
 version:1,segments:[],circles:[],flippers:[],
 triggers:[{name:"Trigger006",x:.1,z:.1,radius:.022}],
 kickers:[],ramps:[]
};
const tj={activeBalls:[],elapsed:10,flippers:{},tilted:false,
 hits:[],sent:[],hit(k,n){this.hits.push([k,n]);},send(k){this.sent.push(k);},
 onDrain(){},timeSinceHit:new Map()};
const tw=new VPXCollisionWorld(triggerData);
const tb={id:3,x:.1,z:.1,vx:0,vz:0,r:.0122,portalUntil:0,age:0};
tj.activeBalls=[tb];
tw.step(tj,.002);
tw.step(tj,.002);
assert.equal(tj.hits.length,1,"VPX trigger must fire on entry, not every frame");
tb.x=.22;tw.step(tj,.002);
tb.x=.1;tw.step(tj,.002);
assert.equal(tj.hits.length,2,"trigger must rearm on exit");
const b=fs.readFileSync("assets/vpx-local/space-cadet.glb"),n=b.readUInt32LE(12),
  json=JSON.parse(b.subarray(20,20+n)),positions={};
for(const node of json.nodes)if(node.name&&node.translation)
  positions[node.name]={x:node.translation[0],z:node.translation[2]};
positions.swPlungerRest={x:.485,z:.957};
const game=new CadetGame(positions,{physics:data});
assert.ok(game.launch(.87));
assert.ok(game.activeBalls[0].z<.95,"spawn ABOVE VPX Wall348, not inside plunger");
let sawBumper=false,sawTarget=false,sawTrigger=false;
for(let i=0;i<4000;i++){
  game.setFlipper("left",i%24<7);
  game.setFlipper("right",i%24<7);
  game.tick(.005);
  for(const event of game.consumeEvents()){
    sawBumper ||= event.type==="bumper";
    sawTarget ||= event.type==="target";
    sawTrigger ||= event.type==="trigger";
  }
  for(const ball of game.activeBalls){
    assert.ok(Number.isFinite(ball.x)&&Number.isFinite(ball.z));
    assert.ok(Number.isFinite(ball.vx)&&Number.isFinite(ball.vz));
    assert.ok(Math.hypot(ball.vx,ball.vz)<3.01);
  }
  if(game.plungerLoaded&&!game.over)game.launch(.87);
}
assert.ok(sawTrigger,"real VPX trigger volumes should be entered");
assert.ok(sawBumper||sawTarget,"a launched ball should reach an actual VPX bumper or target");
// Regression: the prior 2D-only physics bounced the ball between the
// flipper tips and rpin009 forever, never reaching the physical Drain.
const mouth=world.drainMouth;
assert.ok(mouth&&mouth.left<mouth.right);
const mid=(mouth.left+mouth.right)/2;
assert.ok(mid>.25&&mid<.28);
const fallingGame=new CadetGame(positions,{physics:data});
fallingGame.spawnBall(mid,mouth.z-.012,0,.65);
fallingGame.plungerLoaded=false;
fallingGame.saverUntil=-100;
let sawFalling=false,sawDrain=false,visiblySank=false;
for(let i=0;i<250;i++){
  fallingGame.tick(.004);
  for(const event of fallingGame.consumeEvents()){
    sawFalling||=event.type==="falling";
    sawDrain||=event.type==="drain";
  }
  visiblySank||=fallingGame.activeBalls.some(b=>b.sinkDepth>.002);
  if(fallingGame.ballNumber===2)break;
}
assert.ok(sawFalling&&visiblySank&&sawDrain,
  "center lane must sink visually and then drain");
assert.equal(fallingGame.ballNumber,2,"draining should advance ball counter");
assert.equal(fallingGame.activeBalls.length,0);
assert.equal(world.inDrainMouth({x:mouth.left-.02,z:mouth.z+.01,vz:.8}),false,
  "balls on top of a flipper must not be auto-drained");
assert.equal(world.inDrainMouth({x:mid,z:mouth.z+.01,vz:-.8}),false,
  "ball moving back UP through flippers should not drain");
// Full matches with and without active flippers must eventually terminate.
// This prevents the pre-fix endless rebounds between the drain guards.
for(const strategy of ["no flippers","cycling flippers"]){
  const match=new CadetGame(positions,{physics:data});
  let falls=0,drains=0;
  for(let i=0;i<18000&&!match.over;i++){
    const active=strategy==="cycling flippers"&&i%25<7;
    match.setFlipper("left",active);
    match.setFlipper("right",active);
    match.tick(.025);
    for(const e of match.consumeEvents()){
      if(e.type==="falling")falls++;
      if(e.type==="drain")drains++;
    }
    if(match.plungerLoaded&&!match.over)match.launch(.8);
  }
  assert.equal(match.over,true,strategy+" match must reach GAME OVER");
  assert.ok(drains>=3,strategy+" must really drain all 3 balls");
  assert.ok(falls>=3,strategy+" must visibly sink balls into exit");
  assert.equal(match.activeBalls.length,0);
}
console.log("PASS: real VPX drain mouth from flipper pivots, visible sinking, 3-ball game over with idle and cycling flippers.");
console.log("PASS: VPX real collision geometry, height filtering, one-way gate exclusion, authentic flipper travel, segment bounce, entry-only triggers and 20-sec real-table motion.");
console.log(JSON.stringify({wallEdges:world.edges.length,ramps:data.ramps.length,
  realBumpers:data.circles.length,flipperAngles:world.flippers.map(f=>[f.start,f.end]),
  sampledStats:game.physics.stats,score:game.score}));
