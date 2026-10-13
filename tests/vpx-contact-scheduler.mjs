import assert from "node:assert/strict";
import fs from "node:fs";
import {inflateSync} from "node:zlib";
import {VPXCollisionWorld} from "../vpx/collision-world.js";
import {VPXNativeCCD} from "../vpx/vpx-native.js";
import {VPXFlipperTOI} from "../vpx/vpx-flipper-toi.js";
const near=(x,y,e=.005)=>Math.abs(x-y)<=e;
const binary=Buffer.from(fs.readFileSync("vpx/native/vpx_ccd.wasm.base64","utf8").replace(/\s/g,""),"base64");
const {instance}=await WebAssembly.instantiate(binary);
const native=new VPXNativeCCD(instance);
const flipperBinary=inflateSync(Buffer.from(fs.readFileSync(
  "vpx/native/vpx_flipper_ccd.wasm.deflate.base64","utf8").replace(/\s/g,""),"base64"));
native.flipperTOI=new VPXFlipperTOI((await WebAssembly.instantiate(flipperBinary)).instance.exports);
const bare=(walls=[],ramps=[],flippers=[])=>new VPXCollisionWorld({
  version:1,segments:walls,ramps,flippers,kickers:[],circles:[],triggers:[]
},{nativeCCD:native});
const make=(x,z,vx,vz,y=.0122,vy=0,id=1)=>({
  x,z,vx,vz,y,vy,r:.0122,id,wx:0,wy:0,wz:0,
});
const events=[],game={
  elapsed:5,timeSinceHit:new Map(),
  send:(type,event)=>events.push({type,...event}),
  flippers:{left:false,right:false},tilted:false
};
// TWO wall hits in one 50ms fixed step, verify earliest-time queue,
// rather than arbitrary "walls first, flippers second" order.
const walls=[
  {name:"WallRight",type:"Wall",points:[[.1,0],[.1,.2]],
    bottom:0,top:.05,restitution:.9},
  {name:"WallLeft",type:"Wall",points:[[.04,.2],[.04,0]],
    bottom:0,top:.05,restitution:.9}
];
let world=bare(walls);
let ball=make(.07,.1,4,0);
world.scheduler.step([ball],.036,game);
assert.ok(world.stats.nativeHits>=2,"two ordered wall CCD events in one step");
assert.ok(events.some(e=>e.type==="wallCCD"&&e.name==="WallRight"));
assert.ok(events.some(e=>e.type==="wallCCD"&&e.name==="WallLeft"));
assert.ok(ball.x>.027&&ball.x<.113,"multiple collisions cannot tunnel");
assert.ok(world.stats.scheduleCaps===0);
console.log("PASS ordered multi-wall hits",world.stats.nativeHits,ball.x.toFixed(4));
// 3D sphere-sphere impact not seen by ENDPOINT-only checking. The balls
// cross completely within one large timestep.
world=bare();events.length=0;
const first=make(.1,.1,2,0,.0122,0,10),
  second=make(.2,.1,-2,0,.0122,0,11);
world.scheduler.step([first,second],.05,game);
assert.equal(world.stats.ballBallTOI,1);
assert.ok(first.vx<0&&second.vx>0,"normal impulse reverses both balls");
assert.ok(first.x<second.x,"balls remain ordered after CCD");
console.log("PASS real 3D ball-ball swept collision",first.vx,second.vx);
// Two nearly coincident original VPX ramps. High ball must land on upper
// triangle; lower ball must fall through its overhead deck and land low.
// Side of the 3D triangles cannot be an infinite plane.
const decks=[
  {name:"DeckLower",points:[[0,0],[.2,0]],bottom:.027,top:.033,width:.05,restitution:.15},
  {name:"DeckUpper",points:[[0,0],[.2,0]],bottom:.062,top:.068,width:.05,restitution:.15}
];
world=bare([],decks);
let upper=make(.1,0,0,0,.10,-1,20);
events.length=0;
world.scheduler.step([upper],.040,game);
assert.equal(upper.onRamp,"DeckUpper","upper triangle catches first descending ball");
assert.ok(world.stats.rampTOI>=1);
assert.ok(events.some(e=>e.type==="rampLand"&&e.name==="DeckUpper"));
let lower=make(.1,0,0,0,.065,-1,21);
world.scheduler.step([lower],.026,game);
assert.equal(lower.onRamp,"DeckLower","lower ball cannot teleport to upper deck");
const under=make(.1,0,1,0,.0122,0,22);
world.scheduler.step([under],.025,game);
assert.notEqual(under.onRamp,"DeckUpper","under bridge passage stays at floor");
const miss=make(.1,.07,0,0,.1,-1,23);
world.scheduler.step([miss],.042,game);
assert.ok(!miss.onRamp,"outside triangle width is not a landing");
console.log("PASS ramp triangle CCD: upper/lower levels, underside, lateral bounds");
// A fast ball ON the deck must be caught by the swept 3D guard rather
// than escaping through the narrow edge between render/physics frames.
const onDeck=make(.1,0,0,8,.0122+.065,0,25);
onDeck.onRamp="DeckUpper";onDeck.surfaceY=.065;
world.scheduler.step([onDeck],.006,game);
assert.ok(world.stats.rampRailTOI>=1,"VPX elevated side rail detects high-speed crossings");
assert.ok(onDeck.vz<0,"guard returns ball toward ramp center");
assert.equal(onDeck.onRamp,"DeckUpper");
console.log("PASS swept elevated ramp side guard",world.stats.rampRailTOI,onDeck.z);
// Ground arrival event must be sorted with ramp contacts: flight ball drops
// to the floor when it misses the ramp, with no below-table tunneling.
world.scheduler.step([miss],.25,game);
assert.ok(near(miss.y,miss.r)&&!miss.onRamp,"floor catches falling ball");
console.log("PASS floor plane after missed ramp");
// The VPX project retains live fallback for missing WASM module.
const oldWorld=bare([],decks);
oldWorld.nativeCCD=null;
const fall=make(.1,0,0,0,.10,-1,24);
oldWorld.heightField.advanceVertical(fall,.04);
oldWorld.heightField.update(fall,.10,game,.04);
assert.equal(fall.onRamp,"DeckUpper");
console.log("PASS original JS fallback remains playable");
