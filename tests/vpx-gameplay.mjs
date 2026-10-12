import assert from "node:assert/strict";
import {CadetGame,MISSIONS} from "../vpx/gameplay.js";
import {missionTier,MISSION_RULES,stageMatches} from "../vpx/original-rules.js";
const make=()=>new CadetGame({}, {random:()=>.5});
const b={id:1};
const hit=(g,kind,name)=>{g.elapsed+=.5;g.hit(kind,name,b);};
assert.equal(MISSIONS[0][0],"Launch Training");
assert.equal(MISSIONS[0][1],"Re-entry Training");
assert.equal(MISSIONS[0][3],"Science Mission");
assert.equal(MISSION_RULES["Science Mission"].award,750000);
assert.equal(MISSION_RULES["Science Mission"].progress,9);
assert.equal(missionTier(0),0);assert.equal(missionTier(1),1);
assert.equal(missionTier(2),1);assert.equal(missionTier(3),2);
assert.equal(missionTier(7),4);
assert.equal(Object.keys(MISSION_RULES).length,17);
assert.equal(stageMatches(MISSION_RULES["Bug Hunt"].stages[0],"drop","Target014"),true);
let g=make();
assert.equal(g.launch(.85),true);
assert.equal(g.score,0,"plunger charge alone earns no points");
assert.equal(g.launch(.85),false,"one ball must not launch twice");
hit(g,"lane","Trigger020");
assert.equal(g.skillShotValue,75000);
assert.equal(g.score,0,"top light sets skill shot amount; does not award it");
hit(g,"lane","Trigger029");
assert.equal(g.score,75000,"only Trigger029 collects skill shot");
assert.equal(g.skillShots,1);
hit(g,"lane","Trigger029");
assert.equal(g.score,75000,"skill shot collected only once");
// TOP Target004=Launch, CENTER Target003=Re-entry, LOWER Target002=Practice.
g=make();
hit(g,"target","Target004");assert.equal(g.missionChoice,0);
hit(g,"target","Target003");assert.equal(g.missionChoice,1);
hit(g,"target","Target002");assert.equal(g.missionChoice,3);
assert.equal(g.choiceName(),"Science Mission");
assert.equal(g.beginMission(),true);
assert.equal(g.score,10000);
assert.equal(g.missionGoal,9);
assert.equal(g.bonus,25000);
for(let i=0;i<9;i++)hit(g,"target","Target0"+String(14+i));
assert.equal(g.mission,null,"nine drop hits complete Science");
assert.equal(g.progress,9);
assert.ok(g.score>=760000,"science awards 750k + accept 10k");
// Launch Training: 3 actual ramp events, 500k, +6 rank progress.
g=make();g.selectMission(0);g.beginMission();
hit(g,"ramp","LaunchRamp");hit(g,"ramp","LaunchRamp");
assert.equal(g.missionProgress,2);
hit(g,"ramp","LaunchRamp");
assert.equal(g.mission,null);assert.equal(g.progress,6);
assert.ok(g.score>=510000);
// Three launch missions promote at >=17 progress, with no made-up 100k promo.
for(let i=0;i<2;i++){
  g.selectMission(0);g.beginMission();
  for(let j=0;j<3;j++)hit(g,"ramp","LaunchRamp");
}
assert.equal(g.rank,1);assert.equal(g.progress,0);
assert.equal(g.choiceName(),"Bug Hunt");
// Re-entry only accepts the three numbered re-entry top lanes.
g=make();g.selectMission(1);g.beginMission();
hit(g,"lane","Trigger005");assert.equal(g.missionProgress,0);
hit(g,"lane","Trigger006");hit(g,"lane","Trigger007");hit(g,"lane","Trigger008");
assert.equal(g.mission,null);assert.equal(g.progress,6);
// Attack bumpers only Bumper1-3 count, not satellite or engine.
g=make();g.selectMission(2);g.beginMission();
hit(g,"bumper","Bumper4");assert.equal(g.missionProgress,0);
for(let i=0;i<8;i++)hit(g,"bumper","Bumper"+(i%3+1));
assert.equal(g.mission,null);assert.equal(g.progress,6);
// VPX target-bank numbering. Booster=20-22, comet=8-10, radiation=11-13.
g=make();
for(const n of [8,9,10])hit(g,"target","Target"+String(n).padStart(3,"0"));
assert.equal(g.bankCycles.booster,0);
assert.equal(g.banks.comet.size,0);
for(const n of [20,21,22])hit(g,"target","Target"+String(n).padStart(3,"0"));
assert.equal(g.bankCycles.booster,1);
assert.equal(g.jackpotActive,false);
for(const n of [20,21,22])hit(g,"target","Target"+String(n).padStart(3,"0"));
assert.equal(g.bankCycles.booster,2);assert.equal(g.jackpotActive,true);
// Rescue is two-stage: fully upgrade flags (booster) then hyperspace.
g=make();g.rank=1;g.selectMission(1);g.beginMission();
assert.equal(g.mission.name,"Rescue Mission");
assert.equal(g.score,20000);
for(const n of [20,21,22])hit(g,"target","Target"+String(n));
assert.equal(g.mission.stage,1);
hit(g,"hyper","HyperSpaceHole");
assert.equal(g.mission,null);assert.equal(g.progress,7);
assert.ok(g.score>=770000);
// Secret Mission 3 explicit wormholes in order, with 1.5M completion.
g=make();g.rank=1;g.selectMission(3);g.beginMission();
hit(g,"wormhole","Wormhole2");assert.equal(g.mission.stage,0);
hit(g,"wormhole","Wormhole1");assert.equal(g.mission.stage,1);
hit(g,"wormhole","Wormhole2");assert.equal(g.mission.stage,2);
hit(g,"wormhole","Wormhole3");assert.equal(g.mission,null);
assert.equal(g.progress,10);assert.ok(g.score>=1530000);
// A single wormhole visit does not generate multiball; lock all three.
g=make();g.launch(.5);hit(g,"wormhole","Wormhole1");
assert.equal(g.activeBalls.length,1);assert.equal(g.lockedBalls,0);
for(let i=1;i<=3;i++){
  g.wormholeColor=i;
  g.elapsed+=.5;
  g.hit("wormhole","Wormhole"+i,g.activeBalls[0]);
  assert.equal(g.activeBalls.length,0,"locked ball must be removed from playfield");
  for(let t=0;t<23;t++)g.tick(.05); // VPX-inspired 1-second lock/release delay
  assert.equal(g.activeBalls.length,i===3?3:1,
    "lock must auto-serve one replacement, or release three balls");
}
assert.equal(g.multiballActive,true);
assert.equal(g.activeBalls.length,3);
assert.equal(g.lockedBalls,0);
// High-rank names are indexed by the actual rank tiers in VBScript.
g=make();g.rank=3;assert.equal(g.choiceName(),"Stray Comet");
g.rank=5;assert.equal(g.choiceName(),"Satellite Retrieval");
g.rank=7;assert.equal(g.choiceName(),"Cosmic Plague");
// HyperSpaceHole hits: 10k, 20k, 20k, 50k, 150k then reset.
g=make();
for(let i=0;i<5;i++)hit(g,"hyper","HyperSpaceHole");
assert.equal(g.hyperSpaceHits,0);
assert.equal(g.score,250000);
// Full 3 ball flow, ball saver not infinitely reset.
g=make();g.launch(.3);g.elapsed=2;g.saverUntil=12;
g.activeBalls=[];g.onDrain({id:3});assert.equal(g.saves,1);
g.launch(.5);assert.equal(g.saves,1);
g.activeBalls=[];g.onDrain({id:4});
assert.equal(g.ballNumber,2);
g.activeBalls=[];g.onDrain({id:5});
assert.equal(g.ballNumber,3);
g.activeBalls=[];g.onDrain({id:6});assert.equal(g.over,true);
assert.equal(g.launch(.5),false);
g=make();g.launch(.5);
for(const nudge of [-1,1,1,-1])g.nudge(nudge);
assert.equal(g.tilted,true);
console.log("PASS JP v4.3 mission rules: original selection/rank tiers, skill-shot light+collect, exact 4 cadet goals/rewards/progress, booster and target banks, multi-stage rescue/secret, 3 locks for multiball, hyperspace awards, three-ball game-over, tilt.");
