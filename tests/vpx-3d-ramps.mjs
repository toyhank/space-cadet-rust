import assert from "node:assert/strict";
import {LayeredRampWorld} from "../vpx/height-field.js";
import {VPXCollisionWorld} from "../vpx/collision-world.js";
const near=(a,b,eps=.003)=>Math.abs(a-b)<eps;
const tracks=[
  {name:"Lower",bottom:.027,top:.033,width:.05,
    points:[[.1,.2],[.2,.2],[.3,.2]],restitution:.3},
  {name:"Upper",bottom:.062,top:.067,width:.05,
    points:[[.1,.2],[.2,.2],[.3,.2]],restitution:.3},
  {name:"UpperGuide",bottom:.05,top:.07,width:.002,
    points:[[.1,.178],[.3,.178]]}
];
const world=new LayeredRampWorld(tracks);
assert.equal(world.ramps.length,2,"wire/thin ramp pieces must not become solid floors");
assert.ok(near(world.sample("Lower",.2,.2).y,.03));
const e=[];
const game={send:(type,info)=>e.push({type,...info})};
const ball={id:1,x:.15,z:.2,r:.0122,y:.0122,vy:0,vx:0,vz:0};
world.advanceVertical(ball,.008);
world.update(ball,.0122,game,.008);
assert.equal(ball.onRamp,undefined,"ball rolling UNDER a ramp must not snap onto it");
assert.ok(near(ball.y,ball.r),"ground is below the bridge");
// Dropping FROM ABOVE: upper layer wins over coincident lower layer.
ball.y=.07;ball.vy=-.2;
world.update(ball,.09,game,.008);
assert.equal(ball.onRamp,"Upper");
assert.ok(near(ball.y,world.sample("Upper",ball.x,ball.z).y+ball.r));
assert.ok(e.some(x=>x.type==="rampLand"&&x.name==="Upper"));
// A ball traveling on the upper ramp remains above the lower ramp.
ball.vx=.55;
const rampY=ball.y;
for(let i=0;i<12;i++){
  const old=ball.y;
  world.advanceVertical(ball,.008);ball.x+=ball.vx*.008;
  world.update(ball,old,game,.008);
}
assert.equal(ball.onRamp,"Upper");
assert.ok(ball.y>=rampY);
assert.ok(ball.y>world.sample("Lower",ball.x,ball.z).y+ball.r+.02);
// Crossing side guard should reflect outward velocity.
ball.x=.17;ball.z=.223;ball.vx=.3;ball.vz=.6;
world.update(ball,ball.y,game,.008);
assert.ok(ball.vz<.6,"side rail must counter lateral motion");
assert.ok(e.some(x=>x.type==="rampRail"));
// Leaving the last drag point should retain current ball height.
// It must FALL over time rather than teleport to the ground.
ball.x=.295;ball.z=.2;ball.vx=.8;ball.vz=0;
for(let i=0;i<8&&ball.onRamp;i++){
  const old=ball.y;world.advanceVertical(ball,.008);
  ball.x+=ball.vx*.008;world.update(ball,old,game,.008);
}
assert.equal(ball.onRamp,null);
const exitY=ball.y;
assert.ok(exitY>.06&&e.some(x=>x.type==="rampExit"));
for(let i=0;i<70;i++){
  const old=ball.y;world.advanceVertical(ball,.008);
  world.update(ball,old,game,.008);
}
assert.ok(near(ball.y,ball.r),"airborne ball lands on ground after leaving ramp");
assert.ok(e.some(x=>x.type==="ballBounce"),"ball drops with a visible landing");
// Elevated ball goes over projected low walls.
const p={
  version:1,segments:[{name:"Wall",type:"Wall",points:[[.22,.1],[.22,.3]],
    closed:false,bottom:0,top:.018,restitution:.7}],
  ramps:tracks,circles:[],flippers:[],triggers:[],kickers:[]
};
const physics=new VPXCollisionWorld(p);
const fake={hit(){},send(){},timeSinceHit:new Map(),elapsed:1,flippers:{},tilted:false};
const airborne={id:2,x:.21,z:.2,vx:1,vz:0,vy:0,r:.0122,y:.09};
fake.activeBalls=[airborne];fake.onDrain=()=>{};
physics.step(fake,.002);
assert.ok(airborne.vx>0,"high ball must NOT collide with low projected wall");
const grounded={id:3,x:.21,z:.2,vx:1,vz:0,vy:0,r:.0122,y:.0122};
fake.activeBalls=[grounded];physics.step(fake,.002);
assert.ok(grounded.vx<0,"grounded ball must collide with wall");
// Real JP v4.3 geometry has two coincident curved decks, separated by
// more than one ball diameter, plus two extremely narrow steel guard rails.
import fs from "node:fs";
if(fs.existsSync("assets/vpx-local/space-cadet.physics.json")){
const local=JSON.parse(fs.readFileSync("assets/vpx-local/space-cadet.physics.json"));
const actual=new LayeredRampWorld(local.ramps);
assert.equal(actual.ramps.length,2);
const low=actual.sample("Ramp004",.12,.415),high=actual.sample("Ramp009",.12,.415);
assert.ok(low&&high);
assert.ok(high.y-low.y>.025,"overlapping VPX bridge levels stay independent");
const underneath={id:90,x:.12,z:.415,y:.0122,vy:0,vx:0,vz:0,r:.0122};
actual.advanceVertical(underneath,.008);
actual.update(underneath,.0122,game,.008);
assert.equal(underneath.onRamp,undefined,"real VPX top bridge must not grab a ground ball");
const upperBall={id:91,x:.12,z:.415,y:high.y+.0122-.002,
  vy:-.3,vx:0,vz:0,r:.0122};
actual.update(upperBall,high.y+.0122+.004,game,.008);
assert.equal(upperBall.onRamp,"Ramp009");
assert.ok(near(upperBall.y,high.y+.0122));
const lowerBall={id:92,x:.12,z:.415,y:low.y+.0122-.002,
  vy:-.2,vx:0,vz:0,r:.0122};
actual.update(lowerBall,low.y+.0122+.004,game,.008);
assert.equal(lowerBall.onRamp,"Ramp004","ball below upper bridge must land on lower deck");
console.log("PASS 3D: both real JP v4.3 elevated decks and 2 thin guide rails, no lower-to-upper snapping.");
}else console.log("SKIP local JP VPX integration data (public CI uses synthetic ramp tests)");
console.log("PASS 3D: multi-level ramp sampling, fly UNDER bridge, descending landing, curved ramp roll, rail impact, edge departure, ballistic fall, height-filtered wall contacts.");
