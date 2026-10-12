/**
 * Mission names, ranks, entry awards, progress and stage objectives transcribed
 * from the user's local JP's Space Cadet v4.3.vpx source-script.vbs:
 * PrepareForMission, CheckMissionTargets, AcceptMission and CheckMission.
 *
 * The finite-state objectives are authentic to JP v4.3. The browser engine
 * still approximates VPX's 3D physics, and some late-stage hardware events
 * may be unavailable until the corresponding 3D triggers are ported.
 */
export const RANKS=["Cadet","Ensign","Lieutenant","Captain","Lt. Commander",
  "Commander","Commodore","Admiral","Fleet Admiral"];
export const MISSIONS=[
  ["Launch Training","Re-entry Training","Target Practice","Science Mission"],
  ["Bug Hunt","Rescue Mission","Alien Menace","Secret Mission"],
  ["Stray Comet","Space Radiation","Black Hole Threat","Cosmic Plague"],
  ["Satellite Retrieval","Recon Mission","Doomsday Machine","Time Warp"],
  ["Cosmic Plague","Secret Mission","Time Warp","Maelstrom"],
];
export function missionTier(rank){return rank===0?0:rank<=2?1:rank<=4?2:rank<=6?3:4;}
const seq=(type,goal,names=null,description="")=>({type,goal,names,description});
const targets=(first,last)=>Array.from({length:last-first+1},(_,i)=>
  "Target"+String(first+i).padStart(3,"0"));
const triggers=(...indices)=>indices.map(i=>"Trigger"+String(i).padStart(3,"0"));
const attack=["Bumper1","Bumper2","Bumper3"];
const drop=targets(14,22);
const commonLanes=triggers(1,2,3,4,5,6,7,8,9,10,11);
const m=(name,accept,award,progress,stages)=>({name,accept,award,progress,stages});
export const MISSION_RULES={
  "Launch Training":m("Launch Training",10000,500000,6,[seq("ramp",3,null,"Launch ramp ×3")]),
  "Re-entry Training":m("Re-entry Training",10000,500000,6,
    [seq("lane",3,triggers(6,7,8),"Top re-entry lanes ×3")]),
  "Target Practice":m("Target Practice",10000,500000,6,
    [seq("bumper",8,attack,"Attack bumpers ×8")]),
  "Science Mission":m("Science Mission",10000,750000,9,
    [seq("drop",9,drop,"Drop targets ×9")]),
  "Bug Hunt":m("Bug Hunt",20000,750000,7,
    [seq("target",15,targets(1,22),"Targets ×15")]),
  "Rescue Mission":m("Rescue Mission",20000,750000,7,[
    seq("bank",1,["booster"],"Upgrade flags: finish booster targets"),
    seq("hyper",1,["HyperSpaceHole"],"Enter hyperspace")]),
  "Alien Menace":m("Alien Menace",20000,750000,7,[
    seq("bank",1,["weapon"],"Upgrade attack bumpers: top lanes"),
    seq("bumper",8,attack,"Attack bumpers ×8")]),
  "Secret Mission":m("Secret Mission",30000,1500000,10,[
    seq("wormhole",1,["Wormhole1"],"Yellow wormhole"),
    seq("wormhole",1,["Wormhole2"],"Red wormhole"),
    seq("wormhole",1,["Wormhole3"],"Green wormhole")]),
  "Stray Comet":m("Stray Comet",20000,1000000,8,[
    seq("bank",1,["comet"],"Light three comet targets"),
    seq("hyper",1,["HyperSpaceHole"],"Enter hyperspace")]),
  "Space Radiation":m("Space Radiation",20000,1000000,8,[
    seq("bank",1,["radiation"],"Light three radiation targets"),
    seq("wormhole",1,null,"Enter any wormhole")]),
  "Black Hole Threat":m("Black Hole Threat",20000,1000000,8,[
    seq("bank",1,["engine"],"Upgrade engine bumpers"),
    seq("blackHole",1,["BlackHole"],"Enter black hole")]),
  "Cosmic Plague":m("Cosmic Plague",30000,1750000,11,[
    seq("spinner",75,null,"Spin flags ×75"),
    seq("spaceWarp",1,["Trigger028"],"Hit space warp")]),
  "Satellite Retrieval":m("Satellite Retrieval",20000,1250000,9,[
    seq("bumper",3,["Bumper4"],"Satellite bumper ×3")]),
  "Recon Mission":m("Recon Mission",20000,1250000,9,[
    seq("lane",15,commonLanes,"Any lanes ×15")]),
  "Doomsday Machine":m("Doomsday Machine",20000,1250000,9,[
    seq("lane",3,triggers(1,5),"Outlanes ×3")]),
  "Time Warp":m("Time Warp",30000,2000000,12,[
    seq("sling",25,null,"Rebounds ×25"),
    seq("rampOrHyper",1,null,"Launch ramp or hyperspace")]),
  "Maelstrom":m("Maelstrom",30000,5000000,18,[
    seq("drop",3,drop,"Drop targets ×3"),
    seq("target",3,targets(1,13),"Spot targets ×3"),
    seq("lane",5,commonLanes,"Any lanes ×5"),
    seq("fuelChute",1,["Trigger017"],"Hit fuel chute"),
    seq("ramp",1,null,"Launch ramp"),
    seq("spinner",1,null,"Roll a flag"),
    seq("wormhole",1,null,"Enter a wormhole"),
    seq("hyper",1,["HyperSpaceHole"],"Enter hyperspace")]),
};
export function stageMatches(stage,type,name){
  if(!stage)return false;
  const eventType=stage.type;
  if(eventType==="rampOrHyper"){
    if(type!=="ramp"&&type!=="hyper")return false;
  }else if(eventType==="target"&&type==="drop"){
    // All physical drop-target switches are still targets for Bug Hunt.
  }else if(eventType!==type)return false;
  return !stage.names||stage.names.includes(name);
}
